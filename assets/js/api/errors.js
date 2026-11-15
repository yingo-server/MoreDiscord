// errors.js — 16 错误码 → 中文文案 + 处理动作（单一事实来源）
export const ERROR_MAP = {
  INVALID_INPUT:                    { text: '输入内容有误，请检查后重试',            action: 'form' },
  USERNAME_INVALID:                 { text: '用户名格式不对（3-32 位字母、数字、下划线）', action: 'field:username' },
  NAME_INVALID:                     { text: '名称格式不对',                          action: 'field:name' },
  GROUP_FULL:                       { text: '该群组已满员',                          action: 'toast' },
  NOT_A_GROUP:                      { text: '仅群组会话可执行此操作',                action: 'toast' },
  CANNOT_REMOVE_OWNER:              { text: '不能移除群主',                          action: 'dialog' },
  OWNER_MUST_TRANSFER_OR_DELETE:    { text: '请先转让群主或解散群组',                action: 'dialog' },
  UNAUTHORIZED:                     { text: '请先登录',                              action: 'auth' },
  INVALID_CREDENTIALS:              { text: '邮箱或密码不正确',                      action: 'form' },
  FORBIDDEN:                        { text: '无权执行此操作',                        action: 'toast' },
  EMAIL_NOT_CONFIRMED:              { text: '请先确认邮箱后再登录',                  action: 'dialog' },
  USER_NOT_FOUND:                   { text: '用户不存在',                            action: 'toast' },
  NOT_A_MEMBER:                     { text: '你还不是该会话成员',                    action: 'toast+refresh' },
  USERNAME_TAKEN:                   { text: '该用户名已被使用',                      action: 'field:username' },
  EMAIL_EXISTS:                     { text: '该邮箱已注册',                          action: 'field:email' },
  ALREADY_MEMBER:                   { text: '已经是该会话成员',                      action: 'silent' },
  // 兜底 / 网络 / 超时
  NETWORK:                          { text: '网络出现问题，正在重试',                action: 'retry' },
  TIMEOUT:                          { text: '请求超时，正在重试',                    action: 'retry' },
  SERVER:                           { text: '服务器开小差了，请稍后重试',            action: 'toast' },
  UNKNOWN:                          { text: '出错了，请稍后重试',                    action: 'toast' },
};

/** 查询错误信息；未知码归入 UNKNOWN */
export function describeError(code) {
  return ERROR_MAP[code] || ERROR_MAP.UNKNOWN;
}
