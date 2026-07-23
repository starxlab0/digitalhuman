"use strict";
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextureInfo = exports.LAppTextureManager = void 0;
const csmvector_1 = require("../live2d-sdk/type/csmvector");
const lappdelegate_1 = require("./lappdelegate");
// 用于 createImage 的离屏 2D canvas（小程序全局可用）
let s_offscreenCanvas = null;
function getImageCanvas() {
    if (s_offscreenCanvas)
        return s_offscreenCanvas;
    if (typeof wx !== 'undefined' && wx.createOffscreenCanvas) {
        try {
            s_offscreenCanvas = wx.createOffscreenCanvas({ type: '2d' });
            console.log('[LAppTextureManager] createOffscreenCanvas ok:', !!s_offscreenCanvas);
            return s_offscreenCanvas;
        }
        catch (e) {
            console.error('[LAppTextureManager] createOffscreenCanvas failed:', e);
        }
    }
    // 兼容：尝试查找页面中的 #img canvas（live2d-wx 原方案）
    return null;
}
/**
 * テクスチャ管理クラス
 * 画像読み込み、管理を行うクラス。
 */
class LAppTextureManager {
    /**
     * コンストラクタ
     */
    constructor() {
        this._textures = new csmvector_1.csmVector();
    }
    /**
     * 解放する。
     */
    release() {
        for (let ite = this._textures.begin(); ite.notEqual(this._textures.end()); ite.preIncrement()) {
            lappdelegate_1.gl.deleteTexture(ite.ptr().id);
        }
        this._textures = null;
    }
    /**
     * 画像読み込み
     *
     * @param fileName 読み込む画像ファイルパス名
     * @param usePremultiply Premult処理を有効にするか
     * @return 画像情報、読み込み失敗時はnullを返す
     */
    createTextureFromPngFile(fileName, usePremultiply, callback) {
        // search loaded texture already
        for (let ite = this._textures.begin(); ite.notEqual(this._textures.end()); ite.preIncrement()) {
            if (ite.ptr().fileName == fileName &&
                ite.ptr().usePremultply == usePremultiply) {
                // 2回目以降はキャッシュが使用される(待ち時間なし)
                // WebKitでは同じImageのonloadを再度呼ぶには再インスタンスが必要
                // 詳細：https://stackoverflow.com/a/5024181
                const imgCanvas = getImageCanvas();
                if (imgCanvas) {
                    ite.ptr().img = imgCanvas.createImage();
                    ite.ptr().img.onload = () => callback(ite.ptr());
                    ite.ptr().img.src = fileName;
                    return;
                }
                // 兼容：尝试查找页面中的 #img canvas（live2d-wx 原方案）
                const query = wx.createSelectorQuery();
                query.select('#img').node().exec((res) => {
                    if (!res || !res[0] || !res[0].node) {
                        console.warn('[LAppTextureManager] #img canvas not found');
                        return;
                    }
                    const canvas = res[0].node;
                    ite.ptr().img = canvas.createImage();
                    ite.ptr().img.onload = () => callback(ite.ptr());
                    ite.ptr().img.src = fileName;
                });
            }
        }
        const imgCanvas = getImageCanvas();
        console.log('[LAppTextureManager] createTextureFromPngFile:', fileName, 'imgCanvas=', !!imgCanvas);
        const loadImage = (canvas) => {
            if (!canvas || !canvas.createImage) {
                console.error('[LAppTextureManager] no canvas available for createImage');
                return;
            }
            // データのオンロードをトリガーにする
            const img = canvas.createImage();
            img.crossOrigin = "Anonymous";
            img.onload = () => {
                console.log('[LAppTextureManager] image loaded ok:', fileName, img.width, img.height);
                // テクスチャオブジェクトの作成
                const tex = lappdelegate_1.gl.createTexture();
                // テクスチャを選択
                lappdelegate_1.gl.bindTexture(lappdelegate_1.gl.TEXTURE_2D, tex);
                // テクスチャにピクセルを書き込む
                lappdelegate_1.gl.texParameteri(lappdelegate_1.gl.TEXTURE_2D, lappdelegate_1.gl.TEXTURE_MIN_FILTER, lappdelegate_1.gl.LINEAR_MIPMAP_LINEAR);
                lappdelegate_1.gl.texParameteri(lappdelegate_1.gl.TEXTURE_2D, lappdelegate_1.gl.TEXTURE_MAG_FILTER, lappdelegate_1.gl.LINEAR);
                // Premult処理を行わせる
                if (usePremultiply) {
                    lappdelegate_1.gl.pixelStorei(lappdelegate_1.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
                }
                // テクスチャにピクセルを書き込む
                lappdelegate_1.gl.texImage2D(lappdelegate_1.gl.TEXTURE_2D, 0, lappdelegate_1.gl.RGBA, lappdelegate_1.gl.RGBA, lappdelegate_1.gl.UNSIGNED_BYTE, img);
                // ミップマップを生成
                lappdelegate_1.gl.generateMipmap(lappdelegate_1.gl.TEXTURE_2D);
                // テクスチャをバインド
                lappdelegate_1.gl.bindTexture(lappdelegate_1.gl.TEXTURE_2D, null);
                const textureInfo = new TextureInfo();
                if (textureInfo != null) {
                    textureInfo.fileName = fileName;
                    textureInfo.width = img.width;
                    textureInfo.height = img.height;
                    textureInfo.id = tex;
                    textureInfo.img = img;
                    textureInfo.usePremultply = usePremultiply;
                    this._textures.pushBack(textureInfo);
                }
                callback(textureInfo);
            };
            img.onerror = () => {
                console.error('[LAppTextureManager] image load failed:', fileName);
            };
            img.src = fileName;
        };
        if (imgCanvas) {
            loadImage(imgCanvas);
        }
        else {
            // 兼容：尝试查找页面中的 #img canvas（live2d-wx 原方案）
            const query = wx.createSelectorQuery();
            query.select('#img').node().exec((res) => {
                loadImage(res && res[0] && res[0].node);
            });
        }
    }
    /**
     * 画像の解放
     *
     * 配列に存在する画像全てを解放する。
     */
    releaseTextures() {
        for (let i = 0; i < this._textures.getSize(); i++) {
            this._textures.set(i, null);
        }
        this._textures.clear();
    }
    /**
     * 画像の解放
     *
     * 指定したテクスチャの画像を解放する。
     * @param texture 解放するテクスチャ
     */
    releaseTextureByTexture(texture) {
        for (let i = 0; i < this._textures.getSize(); i++) {
            if (this._textures.at(i).id != texture) {
                continue;
            }
            this._textures.set(i, null);
            this._textures.remove(i);
            break;
        }
    }
    /**
     * 画像の解放
     *
     * 指定した名前の画像を解放する。
     * @param fileName 解放する画像ファイルパス名
     */
    releaseTextureByFilePath(fileName) {
        for (let i = 0; i < this._textures.getSize(); i++) {
            if (this._textures.at(i).fileName == fileName) {
                this._textures.set(i, null);
                this._textures.remove(i);
                break;
            }
        }
    }
}
exports.LAppTextureManager = LAppTextureManager;
/**
 * 画像情報構造体
 */
class TextureInfo {
    constructor() {
        this.id = null; // テクスチャ
        this.width = 0; // 横幅
        this.height = 0; // 高さ
    }
}
exports.TextureInfo = TextureInfo;
