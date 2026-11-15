export type Lang = "zh" | "en"

let lang: Lang = detectLang()

function detectLang(): Lang {
  const n = (typeof navigator !== "undefined" && navigator.language) || "en"
  return n.toLowerCase().startsWith("zh") ? "zh" : "en"
}

export function getLang(): Lang {
  return lang
}

/** t(key, params?) — dictionary lookup with {placeholder} interpolation. */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[lang]
  let s: string = dict[key] ?? EN[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
    }
  }
  return s
}

import { useSyncExternalStore } from "react"
const listeners = new Set<() => void>()
/** React hook — language is fixed at startup (no runtime switching UI). */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => lang
  )
}

const EN: Record<string, string> = {
  // common
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving...",
  "common.loading": "Loading...",
  "common.delete": "Delete",
  "common.leave": "Leave",
  "common.confirm": "Confirm",
  "common.working": "Working...",
  "common.loadMore": "Load more",
  "common.version": "Version",

  // auth
  "auth.login.title": "Welcome back",
  "auth.login.email": "Email",
  "auth.login.password": "Password",
  "auth.login.submit": "Sign In",
  "auth.login.signingIn": "Signing in...",
  "auth.login.noAccount": "No account?",
  "auth.login.registerLink": "Register",
  "auth.login.failed": "Login failed",
  "auth.login.emailOrPasswordWrong": "Incorrect email or password",
  "auth.login.unconfirmedHint": "Confirm your email first.",
  "auth.login.sessionExpired": "Session expired",
  "auth.register.title": "Create account",
  "auth.register.email": "Email",
  "auth.register.password": "Password",
  "auth.register.username": "Username",
  "auth.register.submit": "Register",
  "auth.register.creating": "Creating...",
  "auth.register.haveAccount": "Already have an account?",
  "auth.register.loginLink": "Sign in",
  "auth.register.failed": "Registration failed",
  "auth.register.confirmNotice": "Check your email to confirm.",
  "auth.register.confirmTitle": "Check your email",
  "auth.register.confirmSent": "{email}",
  "auth.register.tokenLabel": "Token from the email",
  "auth.register.confirmPassword": "Set password",
  "auth.register.verify": "Verify & sign in",
  "auth.register.verifying": "Verifying...",
  "auth.register.verifyFailed": "Verification failed",
  "auth.register.resend": "Resend email",
  "auth.register.resendSent": "Email sent",
  "auth.register.resendFailed": "Failed to resend email",

  // header
  "header.admin": "Admin",
  "header.profile": "Profile",
  "header.adminPanel": "Admin Panel",
  "header.about": "About & Version",
  "header.logout": "Logout",
  "header.toggleTheme": "Toggle theme",
  "header.aboutTitle": "About MoreDiscord",

  // sidebar
  "sidebar.search": "Search conversations...",
  "sidebar.newConv": "New conversation",
  "sidebar.loadFailed": "Failed to load conversations",
  "sidebar.noResults": "No conversations found",
  "sidebar.renameGroup": "Rename Group",
  "sidebar.properties": "Properties",
  "sidebar.deleteConv": "Delete Conversation",
  "sidebar.leaveGroup": "Leave Group",

  // chat page
  "chat.notFound": "Conversation not found or you don't have access",
  "chat.live": "Live",
  "chat.reconnecting": "Reconnecting…",
  "chat.members": "{n} members",

  // message input / list
  "input.placeholder": "Type a message...",
  "input.send": "Send message",
  "input.tooLong": "Message too long (max {n} characters)",
  "input.sendFailed": "Message failed to send",

  // rooms
  "room.directFallback": "Direct Message",
  "room.create.title": "New Conversation",
  "room.create.direct": "Direct",
  "room.create.group": "Group",
  "room.create.searchUser": "Search User",
  "room.create.searchPlaceholder": "Type username to search...",
  "room.create.selected": "Selected: {name}",
  "room.create.start": "Start Conversation",
  "room.create.groupName": "Group Name",
  "room.create.groupNamePlaceholder": "Enter group name",
  "room.create.addMembers": "Add Members",
  "room.create.needUser": "Select a user",
  "room.create.needName": "Group name is required",
  "room.create.needMember": "Add at least one member",
  "room.create.failed": "Failed to create conversation",
  "room.create.groupFailed": "Failed to create group",
  "room.create.creating": "Creating...",
  "room.dialog.deleteDesc": "Delete this conversation?",
  "room.dialog.leaveDesc": "Leave this group?",
  "room.dialog.namePlaceholder": "group name...",
  "room.dialog.operationFailed": "Operation failed",

  // profile
  "profile.email": "Email",
  "profile.displayName": "Display name",
  "profile.updated": "Profile updated",
  "profile.saveFailed": "Save failed",
  "profile.admin": "Admin",

  // admin
  "admin.denied": "Admin only",
  "admin.title": "Admin Panel",
  "admin.tab.overview": "Overview",
  "admin.tab.channels": "Channels",
  "admin.tab.users": "Users",
  "admin.tab.audit": "Audit Log",
  "admin.forbiddenDesc": "403",
  "admin.opFailed": "Operation failed",
  "admin.ch.name": "Name",
  "admin.ch.type": "Type",
  "admin.ch.members": "Members",
  "admin.ch.created": "Created",
  "admin.ch.actions": "Actions",
  "admin.ch.delete": "Delete Channel",
  "admin.ch.deleteConfirm": 'Delete "{name}"?',
  "admin.ch.messages": "Messages",
  "admin.ch.msgTitle": "Channel Messages",
  "admin.ch.noMsgs": "No messages",
  "admin.users.search": "Search users...",
  "admin.users.username": "Username",
  "admin.users.display": "Display name",
  "admin.users.email": "Email",
  "admin.users.role": "Role",
  "admin.users.roleUser": "User",
  "admin.audit.time": "Time",
  "admin.audit.action": "Action",
  "admin.audit.actor": "Actor",
  "admin.audit.detail": "Detail",

  // error boundary
  "error.title": "Something went wrong",
  "error.generic": "Error",
  "error.reload": "Reload page",
}

const ZH: Record<string, string> = {
  "common.retry": "重试",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.saving": "保存中…",
  "common.loading": "加载中…",
  "common.delete": "删除",
  "common.leave": "退出",
  "common.confirm": "确认",
  "common.working": "处理中…",
  "common.loadMore": "加载更多",
  "common.version": "版本",

  "auth.login.title": "欢迎回来",
  "auth.login.email": "邮箱",
  "auth.login.password": "密码",
  "auth.login.submit": "登录",
  "auth.login.signingIn": "登录中…",
  "auth.login.noAccount": "还没有账号？",
  "auth.login.registerLink": "注册",
  "auth.login.failed": "登录失败",
  "auth.login.emailOrPasswordWrong": "邮箱或密码不正确",
  "auth.login.unconfirmedHint": "请先确认邮箱。",
  "auth.login.sessionExpired": "会话已过期",
  "auth.register.title": "创建账号",
  "auth.register.email": "邮箱",
  "auth.register.password": "密码",
  "auth.register.username": "用户名",
  "auth.register.submit": "注册",
  "auth.register.creating": "注册中…",
  "auth.register.haveAccount": "已有账号？",
  "auth.register.loginLink": "登录",
  "auth.register.failed": "注册失败",
  "auth.register.confirmNotice": "请查收确认邮件。",
  "auth.register.confirmTitle": "请查收邮件",
  "auth.register.confirmSent": "{email}",
  "auth.register.tokenLabel": "邮件中的确认令牌",
  "auth.register.confirmPassword": "设置密码",
  "auth.register.verify": "验证并登录",
  "auth.register.verifying": "验证中…",
  "auth.register.verifyFailed": "验证失败",
  "auth.register.resend": "重新发送邮件",
  "auth.register.resendSent": "已发送",
  "auth.register.resendFailed": "邮件发送失败",

  "header.admin": "管理",
  "header.profile": "个人资料",
  "header.adminPanel": "管理面板",
  "header.about": "关于与版本",
  "header.logout": "退出登录",
  "header.toggleTheme": "切换主题",
  "header.aboutTitle": "关于 MoreDiscord",

  "sidebar.search": "搜索会话…",
  "sidebar.newConv": "新会话",
  "sidebar.loadFailed": "会话加载失败",
  "sidebar.noResults": "未找到会话",
  "sidebar.renameGroup": "重命名群组",
  "sidebar.properties": "会话属性",
  "sidebar.deleteConv": "删除会话",
  "sidebar.leaveGroup": "退出群组",

  "chat.notFound": "会话不存在或无权访问",
  "chat.live": "在线",
  "chat.reconnecting": "正在重新连接…",
  "chat.members": "{n} 位成员",

  "input.placeholder": "输入消息…",
  "input.send": "发送消息",
  "input.tooLong": "消息过长（最多 {n} 个字符）",
  "input.sendFailed": "消息发送失败",

  "room.directFallback": "私聊",
  "room.create.title": "新会话",
  "room.create.direct": "私聊",
  "room.create.group": "群聊",
  "room.create.searchUser": "搜索用户",
  "room.create.searchPlaceholder": "输入用户名搜索…",
  "room.create.selected": "已选择：{name}",
  "room.create.start": "开始会话",
  "room.create.groupName": "群组名称",
  "room.create.groupNamePlaceholder": "输入群组名称",
  "room.create.addMembers": "添加成员",
  "room.create.needUser": "请选择用户",
  "room.create.needName": "请输入群组名称",
  "room.create.needMember": "请至少添加一名成员",
  "room.create.failed": "创建会话失败",
  "room.create.groupFailed": "创建群组失败",
  "room.create.creating": "创建中…",
  "room.dialog.deleteDesc": "删除该会话？",
  "room.dialog.leaveDesc": "退出该群组？",
  "room.dialog.namePlaceholder": "群组名称…",
  "room.dialog.operationFailed": "操作失败",

  "profile.email": "邮箱",
  "profile.displayName": "显示名",
  "profile.updated": "资料已更新",
  "profile.saveFailed": "保存失败",
  "profile.admin": "管理员",

  "admin.denied": "无权限",
  "admin.title": "管理面板",
  "admin.tab.overview": "概览",
  "admin.tab.channels": "频道",
  "admin.tab.users": "用户",
  "admin.tab.audit": "审计日志",
  "admin.forbiddenDesc": "无权限",
  "admin.opFailed": "操作失败",
  "admin.ch.name": "名称",
  "admin.ch.type": "类型",
  "admin.ch.members": "成员数",
  "admin.ch.created": "创建时间",
  "admin.ch.actions": "操作",
  "admin.ch.delete": "删除频道",
  "admin.ch.deleteConfirm": "删除「{name}」？",
  "admin.ch.messages": "消息",
  "admin.ch.msgTitle": "频道消息",
  "admin.ch.noMsgs": "暂无消息",
  "admin.users.search": "搜索用户…",
  "admin.users.username": "用户名",
  "admin.users.display": "显示名",
  "admin.users.email": "邮箱",
  "admin.users.role": "角色",
  "admin.users.roleUser": "用户",
  "admin.audit.time": "时间",
  "admin.audit.action": "操作",
  "admin.audit.actor": "操作者",
  "admin.audit.detail": "详情",

  "error.title": "出错了",
  "error.generic": "出错了",
  "error.reload": "重新加载页面",
}

const DICTS: Record<Lang, Record<string, string>> = { en: EN, zh: ZH }

// pending unconfirmed signup hint (task 3): recorded in-memory after a signup
// that returned confirmation_required, consumed by LoginForm on
// INVALID_CREDENTIALS (GoTrue reports unconfirmed users identically to a bad
// password, so we can only hint client-side).
let pendingUnconfirmed = false
export function markPendingUnconfirmed() {
  pendingUnconfirmed = true
}
export function consumePendingUnconfirmed(): boolean {
  const v = pendingUnconfirmed
  pendingUnconfirmed = false
  return v
}
