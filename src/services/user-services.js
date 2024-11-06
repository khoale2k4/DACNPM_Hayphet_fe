const nodemailer = require("nodemailer");
const crypto = require('crypto'); 
const db = require('../models/index');
var bcrypt = require('bcryptjs');
const { error } = require("console");
const { resolve } = require("path");
const { rejects } = require("assert");
var salt = bcrypt.genSaltSync(10);

/**
 * Creates a new user in the database.
 * 
 * This function takes user registration information from the request body,
 * hashes the password, and then saves the new user in the database.
 *
 * @param {Object} body - The registration information for the new user.
 * @returns {Promise<string>} A promise that resolves to a success message 
 * @throws {Error} Will throw an error if there is an issue during user creation.
 */
let createUser = async (body) => { //body of html file which contains register information
  return new Promise(async (resolve, reject) => {
    try {
      if (!body.email) {
        resolve({
          errCode: 2,
          message: 'Missing email'
        })
      }
      let check = await checkUserEmail(body.email);
      if (check) {
        resolve({
          errCode: 1,
          message: 'This email is already in used.'
        })
      } 
      let hashedPwFromBcrypt = await hashUserPassword(body.password);
      await db.User.create({
        name: body.name,
        email: body.email,
        hashed_pw: hashedPwFromBcrypt,
        role: 'user',
      })
      resolve({
        errCode: 0,
        message: 'Ok'
      });
    } catch (e) {
      reject(e);
    }
  })
}




let generateOTP = () => {
    const otp = crypto.randomInt(100000, 999999); 
    return otp.toString();
}
let sendOtpEmail = async (email, otp) => {
    const transporter = nodemailer.createTransport({
        service: 'Gmail', 
        auth: {
            user: 'dacnpm.tuanphatfanclub@gmail.com',
            pass: 'tfdx qucb ypqg wtut', 
        },
    });

    const htmlTemplate = `<p>OTP xác thực:<br><br>
        <strong style="font-size: 20px; color: red;">${otp}</strong>
        <br><br>
        Vui lòng không tiết lộ OTP cho bất kỳ ai.
        <br><br>
        </p>`;

    const mailOptions = {
        from: 'dacnpm.tuanphatfanclub@gmail.com',
        to: email,
        subject: 'Xác thực OTP',
        html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    return otp;
}
let handleUserSignin_sentAuthCode = (email) => {
  return new Promise( async (resolve, reject) => {
    try {
      if (!email) {
        resolve({
          errCode: 1,
          message: "Missing email"
        })
      }
      let check = await checkUserEmail(email);
      if (check) {
        resolve({
          errCode: 1,
          message: 'This email is already in used.'
        })
      }
      await db.ConfirmationCode.update(
        { status: 'used' }, // New status
        { where: { email: email, status: 'active' } } // Conditions for the update
      );
      let otp = await sendOtpEmail(email, generateOTP());
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.ConfirmationCode.create({
        email: email,
        code: otp,
        expiresAt: expiresAt
      })
      resolve({
        errCode: 0,
        message: 'Ok. Authentication code has been sent'
      })
    } catch (e) {
      reject(e);
    }
  })
}

let handleUserSignin_verifyAuthCode = (email, password, authCode) => {
  return new Promise( async (resolve, reject) => {
    try {
      let check = await checkAuthCode(email, authCode);
      if(check) {
        let createUserMessage = await createUser({ email: email, password: password });
        resolve({
          errCode: createUserMessage.errCode,
          message: createUserMessage.message
        })
      } else {
        resolve({
          errCode: 3,
          message: 'Invalid authentication code.'
        })
      }
    } catch(e){
      reject(e);
    }
  })

}

/**
 * This function hash a string.
 * 
 * @param {string} password - The password string that need to be hashed. 
 * @returns {Promise<string>} - The hashed password.
 */
let hashUserPassword = (password) => {
  return new Promise((resolve, reject) => {
    try {
      let hashed_pw =  bcrypt.hashSync(password, salt);
      resolve(hashed_pw);
    } catch (e) {
        reject(e);
    }
  })
}

let checkAuthCode = (email, userAuthCode) => {
  return new Promise( async (resolve, reject) => {
    try {
      let authCodeInDb = await db.ConfirmationCode.findOne({
        where: {
          email: email,
          status: 'active'
        },
      })
      if(authCodeInDb) {
        if(authCodeInDb.code === userAuthCode ) {
          authCodeInDb.status = 'used';
          await authCodeInDb.save();
          if (authCodeInDb.expiresAt > new Date()) {
            resolve(true);
          }
          resolve(false);
        }
      }
      resolve(false);
    } catch(e) {
      reject(e);
    }
  })
}



/**
 * Retrieves user information by user ID.
 * 
 * If the user is found, it resolves with the user data; 
 * otherwise, it resolves with an empty object.
 *
 * @param {number} id - The ID of the user to retrieve.
 * @returns {Promise<Object>} A promise that resolves to the user object if found, or an empty object if not found.
 * @throws {Error} Will throw an error if there is an issue during the retrieval process.
 */
let getUserInfoByID = (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findByPk(id, { raw: true, });
      if (user) {
        resolve(user);
      } else {
        resolve({});
      }
    } catch (e) {
      reject(e);
    }
  });
};


/**
 * Updates user information for a given user ID.
 * 
 * Field name must be the same as ones stored in database.
 * 
 * @param {number} id - The ID of the user to update.
 * @param {Object} [updateData] - An object containing the fields to update, can be leaved as null.
 */
let updateUserInfo = (id, updateData) => {
  return new Promise(async(resolve, reject) => {
    try {
      if (!updateData || Object.keys(updateData).length === 0) {
        resolve(); 
      }     
      let user = await db.User.findByPk(id);
      if (user) {
        for (const key in updateData) {
          user[key] = updateData[key];
        }
        await user.save();
        resolve();
      } else {
        resolve();
      }
    } catch (e) {
      reject(e);
    }
  })
}



/**
 * Handles user login by checking email and password credentials.
 *
 * @param {string} userEmail - The email of the user trying to log in.
 * @param {string} userPassword - The password of the user trying to log in.
 * @returns {Promise<Object>} - A promise that resolves to an object containing:
 * - `errCode` {number}: An error code (0 for success, 1 if account doesn't exist, 2 if user not found, 3 if wrong password).
 * - `message` {string}: A message describing the result.
 * - `user` {Object|undefined}: An object with the user information (excluding `hashed_pw`) if login is successful, otherwise undefined.
 *
 * @throws Will reject with an error if any exception occurs during the login process.
 */
let handleUserLogin = (userEmail, userPassword) => {
  return new Promise(async(resolve, reject) => {
    try {
      let userData = {};
      let isExist = await checkUserEmail(userEmail);
      if(isExist) {
        let user = await db.User.findOne({
          where: {email:  userEmail},
          attributes: ['email', 'role', 'hashed_pw'],
          raw: true
        })
        if(user) {
          //compare password
          let isMatch = bcrypt.compareSync(userPassword, user.hashed_pw);
          if(isMatch) {
            userData.errCode = 0;
            userData.message = 'Ok';
            delete user.hashed_pw;
            userData.user = user;
          } else {
            userData.errCode = 3;
            userData.message = 'Wrong password';
          }
        } else {
          userData.errCode = 2,
          userData.message = 'User is not found'
        }
      } else {
        userData.errCode = 1;
        userData.message = 'Account is not exist.';
      }
      resolve(userData);
    } catch (e) {
      reject(e);
    }
  })
}



let checkUserEmail = (userEmail) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await db.User.findOne({
        where: { email: userEmail },
      });
      if (user) {
        resolve(true);
      } else {
        resolve(false);
      }
    } catch (e) {
      reject(e);
    }
  });
};




module.exports = {
  createUser: createUser,
  getUserInfoByID: getUserInfoByID,
  updateUserInfo: updateUserInfo,
  hashUserPassword: hashUserPassword,
  handleUserLogin: handleUserLogin,
  handleUserSignin_sentAuthCode: handleUserSignin_sentAuthCode,
  handleUserSignin_verifyAuthCode: handleUserSignin_verifyAuthCode,
}