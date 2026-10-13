declare module "qrious" {
  interface QRiousOptions {
    element?: HTMLCanvasElement | HTMLImageElement;
    value?: string;
    size?: number;
    level?: "L" | "M" | "Q" | "H";
    background?: string;
    foreground?: string;
    padding?: number;
  }

  export default class QRious {
    constructor(options?: QRiousOptions);
    toDataURL(): string;
  }
}
