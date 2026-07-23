import { LogLevel } from '../live2d-sdk/live2dcubismframework';

export const ModelDir: string[] = ['Haru'];
export const scale1: number = 1.6;
export const translate1: { x: number; y: number } = { x: 0, y: -0.35 };

export const ModelDirSize: number = ModelDir.length;

const windowInfo = wx.getWindowInfo();

export const CanvasSize: { width: number; height: number } | 'auto' = {
  width: windowInfo.screenWidth,
  height: windowInfo.screenHeight,
};

export const ViewScale = 1.0;
export const ViewMaxScale = 2.0;
export const ViewMinScale = 0.8;

export const ViewLogicalLeft = -1.0;
export const ViewLogicalRight = 1.0;
export const ViewLogicalBottom = -1.0;
export const ViewLogicalTop = 1.0;

export const ViewLogicalMaxLeft = -2.0;
export const ViewLogicalMaxRight = 2.0;
export const ViewLogicalMaxBottom = -2.0;
export const ViewLogicalMaxTop = 2.0;

export const ResourcesPath =
  'https://txcj.oss-cn-beijing.aliyuncs.com/live2d/';

export const BackImageName = '';
export const GearImageName = '';
export const PowerImageName = '';

export const MotionGroupIdle = 'Idle';
export const MotionGroupTapBody = 'TapBody';

export const HitAreaNameHead = 'Head';
export const HitAreaNameBody = 'Body';

export const PriorityNone = 0;
export const PriorityIdle = 1;
export const PriorityNormal = 2;
export const PriorityForce = 3;

export const DebugLogEnable = true;
export const DebugTouchLogEnable = false;

export const CubismLoggingLevel: LogLevel = LogLevel.LogLevel_Verbose;

export const RenderTargetWidth = 1900;
export const RenderTargetHeight = 1000;
