const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, 'src', 'controllers', 'authController.js');

const lines = [
  "const bcrypt = require('bcryptjs');",
  "const db = require('../db');",
  "const { sendVerificationCode } = require('../services/emailService');",
  "const { verifyEmailDeliverability } = require('../services/emailValidationService');",
  "const { generateVerificationCode } = require('../utils/codeGenerator');",
  "",
  "const CODE_EXPIRATION_MINUTES = 10;",
  "const STUDENT_ROLE = 'student';",
  "const ALLOWED_ZEROBOUNCE_STATUSES = ['valid', 'catch-all'];",
  "",
  "function sanitizeEmail(email = '') {",
  "  return email.trim().toLowerCase();",
  "}",
  "",
  "function isInstitutionalEmail(email) {",
  "  return /@miumg\.edu\.gt$/i.test(email);",
  "}",
  "",
