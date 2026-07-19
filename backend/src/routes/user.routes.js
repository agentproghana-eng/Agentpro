// user.routes.js
const express = require('express');
const userRouter = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');

userRouter.use(authenticate);
userRouter.get('/', authorize('superuser', 'business_owner', 'manager'), userController.listUsers);
userRouter.post('/', authorize('superuser', 'business_owner'), userController.createUser);
userRouter.patch('/me/password', userController.changePassword);
userRouter.patch('/me/settings', userController.updateMySettings);
userRouter.get('/:user_id', authorize('superuser', 'business_owner', 'manager'), userController.getUser);
userRouter.patch('/:user_id', authorize('superuser', 'business_owner'), userController.updateUser);
userRouter.patch('/:user_id/reassign-branch', authorize('superuser', 'business_owner'), userController.reassignBranch);

module.exports = userRouter;
