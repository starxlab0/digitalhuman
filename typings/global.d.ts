// 兼容 Live2D SDK 中使用的浏览器/小程序全局类型
// 这些在小程序运行时已存在，但在 TypeScript 仅声明 ES2020 时需要显式声明为类型

type WebGLTexture = any;
type WebGLProgram = any;
type WebGLBuffer = any;
type WebGLUniformLocation = any;
type WebGLFramebuffer = any;
type WebGLRenderingContext = any;
type GLenum = number;
type GLuint = number;
type HTMLImageElement = any;

declare const fetch: (input: any, init?: any) => Promise<any>;
declare const TextEncoder: any;
declare const window: any;
