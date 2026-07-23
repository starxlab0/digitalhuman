"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RenderTargetHeight = exports.RenderTargetWidth = exports.CubismLoggingLevel = exports.DebugTouchLogEnable = exports.DebugLogEnable = exports.PriorityForce = exports.PriorityNormal = exports.PriorityIdle = exports.PriorityNone = exports.HitAreaNameBody = exports.HitAreaNameHead = exports.MotionGroupTapBody = exports.MotionGroupIdle = exports.PowerImageName = exports.GearImageName = exports.BackImageName = exports.ResourcesPath = exports.ViewLogicalMaxTop = exports.ViewLogicalMaxBottom = exports.ViewLogicalMaxRight = exports.ViewLogicalMaxLeft = exports.ViewLogicalTop = exports.ViewLogicalBottom = exports.ViewLogicalRight = exports.ViewLogicalLeft = exports.ViewMinScale = exports.ViewMaxScale = exports.ViewScale = exports.CanvasSize = exports.ModelDirSize = exports.translate1 = exports.scale1 = exports.ModelDir = void 0;
const live2dcubismframework_1 = require("../live2d-sdk/live2dcubismframework");
exports.ModelDir = ['Haru']; // 少女形象
exports.scale1 = 1;
exports.translate1 = { x: -0.0, y: 0 };
exports.ModelDirSize = exports.ModelDir.length;
const windowInfo = wx.getWindowInfo();
exports.CanvasSize = {
    width: windowInfo.screenWidth,
    height: windowInfo.screenHeight,
};
exports.ViewScale = 1.0;
exports.ViewMaxScale = 2.0;
exports.ViewMinScale = 0.8;
exports.ViewLogicalLeft = -1.0;
exports.ViewLogicalRight = 1.0;
exports.ViewLogicalBottom = -1.0;
exports.ViewLogicalTop = 1.0;
exports.ViewLogicalMaxLeft = -2.0;
exports.ViewLogicalMaxRight = 2.0;
exports.ViewLogicalMaxBottom = -2.0;
exports.ViewLogicalMaxTop = 2.0;
exports.ResourcesPath = 'https://txcj.oss-cn-beijing.aliyuncs.com/live2d/'; // 阿里云OSS CDN
exports.BackImageName = '';
exports.GearImageName = 'icon_gear.png';
exports.PowerImageName = 'CloseNormal.png';
exports.MotionGroupIdle = 'Idle';
exports.MotionGroupTapBody = 'TapBody';
exports.HitAreaNameHead = 'Head';
exports.HitAreaNameBody = 'Body';
exports.PriorityNone = 0;
exports.PriorityIdle = 1;
exports.PriorityNormal = 2;
exports.PriorityForce = 3;
exports.DebugLogEnable = true;
exports.DebugTouchLogEnable = false;
exports.CubismLoggingLevel = live2dcubismframework_1.LogLevel.LogLevel_Verbose;
exports.RenderTargetWidth = 1900;
exports.RenderTargetHeight = 1000;
