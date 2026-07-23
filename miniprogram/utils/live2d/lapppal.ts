/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * プラットフォーム依存機能を抽象化する Cubism Platform Abstraction Layer.
 *
 * ファイル読み込みや時刻取得等のプラットフォームに依存する関数をまとめる。
 */
export class LAppPal {
  /**
   * ファイルをバイトデータとして読みこむ
   *
   * @param filePath 読み込み対象ファイルのパス
   * @return
   * {
   *      buffer,   読み込んだバイトデータ
   *      size        ファイルサイズ
   * }
   */
  public static loadFileAsBytes(
    filePath: string,
    callback: (arrayBuffer: ArrayBuffer, size: number) => void
  ): void {
    // 微信小程序优先使用 wx.request，失败时回退到 fetch
    const onError = (err: any): void => {
      console.warn('[LAppPal] wx.request failed, fallback to fetch:', filePath, err);
      fetch(filePath)
        .then((response: any) => response.arrayBuffer())
        .then((arrayBuffer: ArrayBuffer) => callback(arrayBuffer, arrayBuffer.byteLength))
        .catch((e: any) => console.error('[LAppPal] fetch failed:', filePath, e));
    };

    if (typeof wx !== 'undefined' && wx.request) {
      wx.request({
        url: filePath,
        method: 'GET',
        responseType: 'arraybuffer',
        success: (res: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
            callback(res.data as ArrayBuffer, (res.data as ArrayBuffer).byteLength);
          } else {
            onError(res);
          }
        },
        fail: onError,
      });
    } else {
      fetch(filePath)
        .then((response: any) => response.arrayBuffer())
        .then((arrayBuffer: ArrayBuffer) => callback(arrayBuffer, arrayBuffer.byteLength))
        .catch((e: any) => console.error('[LAppPal] fetch failed:', filePath, e));
    }
  }

  /**
   * デルタ時間（前回フレームとの差分）を取得する
   * @return デルタ時間[ms]
   */
  public static getDeltaTime(): number {
    return this.s_deltaTime;
  }

  public static updateTime(): void {
    this.s_currentFrame = Date.now();
    this.s_deltaTime = (this.s_currentFrame - this.s_lastFrame) / 1000;
    this.s_lastFrame = this.s_currentFrame;
  }

  /**
   * メッセージを出力する
   * @param message 文字列
   */
  public static printMessage(message: string): void {
    console.log(message);
  }

  static lastUpdate =  Date.now();

  static s_currentFrame = 0.0;
  static s_lastFrame = 0.0;
  static s_deltaTime = 0.0;
}
