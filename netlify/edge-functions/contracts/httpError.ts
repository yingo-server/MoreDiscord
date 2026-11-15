// L0 契约层：统一错误类型
import { STATUS_BY_CODE } from "./errors.ts";

export class HttpError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 500;
  }
}
