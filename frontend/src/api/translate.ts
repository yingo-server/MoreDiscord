// 消息翻译：走 api/client.ts 唯一出口
import { api } from "./client"

export interface TranslateResult {
  translation: string
  target_lang: string
}

export function translateMessage(text: string, target_lang: string): Promise<TranslateResult> {
  return api.post<TranslateResult>("/translate", { text, target_lang })
}
