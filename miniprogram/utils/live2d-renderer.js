/**
 * Live2dRenderer — Live2D 渲染引擎 JS 封装
 *
 * 封装 live2d-wx 的 TypeScript SDK，提供简洁的 JS API：
 *   - init(webglCanvas)    初始化 Cubism + 加载模型
 *   - render()             单帧渲染
 *   - setExpression(name)  切换情绪（通过索引映射 Haru F01~F0X）
 *   - setMouthOpen(v)      控制张嘴幅度 0~1
 *   - setEyeTarget(x,y)    眼球追踪 -1~1
 *   - touchBegan/Moved/Ended 触摸拖拽
 *   - destroy()            释放资源
 */

console.log('[Live2dRenderer] file loaded (top-level)');

let _delegate = null;
let _live2DManager = null;
let _LAppView = null;
let _LAppPal = null;
let _inited = false;
let _modelParamIndex = {};
let _exprCount = 0;

// ====== 参数 ID 缓存 ======
const PARAM_KEYS = [
  'ParamMouthOpenY', 'ParamMouthForm',
  'ParamEyeLOpen', 'ParamEyeROpen',
  'ParamEyeBallX', 'ParamEyeBallY',
  'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
  'ParamBodyAngleX', 'ParamBodyAngleY', 'ParamBodyAngleZ',
  'ParamBrowLY', 'ParamBrowRY',
  'ParamBreath',
];

// ====== 情绪 → Live2D expression 索引映射 ======
// Haru 表情: 0=Neutral, 1=Happy, 2=Angry, 3=Sad, 4=Surprised, ...
const EXPR_INDEX = {
  neutral:    0,  // Neutral
  happy:      1,  // Happy
  angry:      2,  // Angry
  sad:        3,  // Sad
  surprised:  4,  // Surprised
  love:       1,  // Happy 代替
};

// ====== 内部函数 ======

function _getModel() {
  if (!_live2DManager) return null;
  try { return _live2DManager.getModel(0); } catch (_) { return null; }
}

function _cacheParamIds(model) {
  if (!model || !model.model) return;
  PARAM_KEYS.forEach(k => {
    try {
      _modelParamIndex[k] = model.model.getParameterIndex(k);
    } catch (_) { /* 忽略 */ }
  });
}

function _detectExpressions(model) {
  if (!model || !model._expressions) return;
  const exprList = model._expressions._keyValues;
  if (!exprList) return;
  _exprCount = exprList.getSize();
  console.log('[Live2d] detected', _exprCount, 'expressions');
}

function _setParam(key, value, weight) {
  weight = weight != null ? weight : 1.0;
  const id = _modelParamIndex[key];
  if (id == null || id < 0) return;
  try {
    const model = _getModel();
    if (model && model.model) {
      model.model.setParameterValueById(id, value, weight);
    }
  } catch (_) { /* ignore */ }
}

// ====== 公共 API ======

function init(webglCanvas) {
  if (_inited) return;
  try {
    console.log('[Live2dRenderer] requiring lappdelegate...');
    const LAppDelegate = require('./live2d/lappdelegate').LAppDelegate;
    console.log('[Live2dRenderer] requiring lappview/lapppal/lapplive2dmanager...');
    _LAppView = require('./live2d/lappview').LAppView;
    _LAppPal = require('./live2d/lapppal').LAppPal;
    const LAppLive2DManager = require('./live2d/lapplive2dmanager').LAppLive2DManager;
    console.log('[Live2dRenderer] modules loaded');

    _delegate = LAppDelegate.getInstance();
    console.log('[Live2dRenderer] delegate instance ok');

    // 注入组件 canvas
    console.log('[Live2dRenderer] initCanvas start');
    _delegate.initCanvas(webglCanvas);
    console.log('[Live2dRenderer] initCanvas done');

    _live2DManager = LAppLive2DManager.getInstance();
    console.log('[Live2dRenderer] live2DManager instance ok');

    // 等待模型加载完成后缓存参数 ID
    _waitModelReady();

    _inited = true;
    console.log('[Live2dRenderer] init done');
  } catch (err) {
    console.error('[Live2dRenderer] init error:', err);
    throw err;
  }
}

function _waitModelReady(retries) {
  retries = retries || 0;
  if (retries > 80) return; // 最多等 8 秒
  const model = _getModel();
  if (model && model.model && model.model.getParameterIndex('ParamMouthOpenY') >= 0) {
    _cacheParamIds(model);
    _detectExpressions(model);
    // 默认表情
    setExpression('neutral');
    console.log('[Live2d] model ready, params cached, expressions:', _exprCount);
    return;
  }
  setTimeout(() => _waitModelReady(retries + 1), 100);
}

function render() {
  if (!_delegate || !_inited) return;
  try {
    _delegate.run();
  } catch (err) {
    // 初始化未完成或模型尚未加载时可能报错，属于正常现象
    console.warn('[Live2dRenderer] render skipped:', err && err.message);
  }
}

function setExpression(name) {
  const model = _getModel();
  if (!model) return;
  const idx = EXPR_INDEX[name] || 0;
  // 确保索引不超出范围
  const safeIdx = _exprCount > 0 ? Math.min(idx, _exprCount - 1) : idx;
  try {
    model.setExpression1(safeIdx);
  } catch (_) { /* 忽略 */ }
}

function setMouthOpen(value) {
  _setParam('ParamMouthOpenY', Math.min(1, Math.max(0, value)));
}

function setMouthForm(value) {
  _setParam('ParamMouthForm', Math.min(1, Math.max(0, value)));
}

function setEyeTarget(x, y) {
  _setParam('ParamEyeBallX', Math.min(1, Math.max(-1, x)));
  _setParam('ParamEyeBallY', Math.min(1, Math.max(-1, y)));
}

function setHeadAngle(x, y, z) {
  _setParam('ParamAngleX', x);
  _setParam('ParamAngleY', y);
  _setParam('ParamAngleZ', z);
}

function touchBegan(x, y) {
  if (!_getModel() || !_delegate) return;
  const view = _delegate.getView();
  if (view) view.onTouchesBegan(x, y);
}

function touchMoved(x, y) {
  if (!_getModel() || !_delegate) return;
  const view = _delegate.getView();
  if (view) view.onTouchesMoved(x, y);
}

function touchEnded(x, y) {
  if (!_getModel() || !_delegate) return;
  const view = _delegate.getView();
  if (view) view.onTouchesEnded(x, y);
}

function isReady() {
  return _inited && _getModel() != null;
}

function destroy() {
  _inited = false;
  _modelParamIndex = {};
  _exprCount = 0;
  _delegate = null;
  _live2DManager = null;
  _LAppView = null;
  _LAppPal = null;
}

module.exports = {
  init,
  render,
  setExpression,
  setMouthOpen,
  setMouthForm,
  setEyeTarget,
  setHeadAngle,
  touchBegan,
  touchMoved,
  touchEnded,
  isReady,
  destroy,
};
