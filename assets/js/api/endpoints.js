// endpoints.js — 端点清单（唯一登记处，路径以真实 API 契约为准）
// m: HTTP 方法, p: 路径模板（:param 由 client 填充）, auth: false 表示无需 token
export const API = {
  // —— 认证 ——
  signup:      { m: 'POST',  p: '/auth/signup',  auth: false },
  verify:      { m: 'POST',  p: '/auth/verify',  auth: false },
  login:       { m: 'POST',  p: '/auth/login',   auth: false },
  logout:      { m: 'POST',  p: '/auth/logout' },
  recover:     { m: 'POST',  p: '/auth/recover', auth: false },
  me:          { m: 'GET',   p: '/auth/me' },
  // —— 用户 ——
  setUsername: { m: 'PATCH', p: '/user/username' },
  setProfile:  { m: 'PATCH', p: '/user/profile' },
  // —— 会话 ——
  conversations:   { m: 'GET',    p: '/conversations', poll: true },
  conversation:    { m: 'GET',    p: '/conversations/:id' },
  createDirect:    { m: 'POST',   p: '/conversations/direct' },
  createGroup:     { m: 'POST',   p: '/conversations/group' },
  renameConv:      { m: 'PATCH',  p: '/conversations/:id' },
  addMember:       { m: 'POST',   p: '/conversations/:id/members' },
  removeMember:    { m: 'DELETE', p: '/conversations/:id/members/:userId' },
  leaveConv:       { m: 'POST',   p: '/conversations/:id/leave' },
  deleteConv:      { m: 'DELETE', p: '/conversations/:id' },
  transferOwner:   { m: 'POST',   p: '/conversations/:id/transfer' },
  markRead:        { m: 'PATCH',  p: '/conversations/:id/read' },
  // —— 消息 ——
  sendMessage: { m: 'POST', p: '/conversations/:id/messages' },
  messages:    { m: 'GET',  p: '/conversations/:id/messages' },
  messageSync: { m: 'GET',  p: '/conversations/:id/messages/sync', poll: true },
  // —— 管理面板（后端未启用，预留标记，UI 降级提示"等待后端启用"） ——
  adminUsers:       { m: 'GET',   p: '/admin/users',  admin: true },
  adminUserDetail:  { m: 'GET',   p: '/admin/users/:id',  admin: true },
  adminUserPatch:   { m: 'PATCH', p: '/admin/users/:id',  admin: true },
  adminListUsers:   { m: 'GET',   p: '/admin/users',  admin: true },
  adminListChannels:{ m: 'GET',   p: '/admin/channels',  admin: true },
  adminDeleteChannel: { m: 'DELETE', p: '/admin/channels/:id',  admin: true },
  adminAuditMessages: { m: 'GET',  p: '/admin/channels/:id/messages',  admin: true },
  adminMessageSearch: { m: 'GET',  p: '/admin/messages/search',  admin: true },
  adminStats:       { m: 'GET',   p: '/admin/stats/overview',  admin: true },
  adminAuditLog:    { m: 'GET',   p: '/admin/audit-log',  admin: true },
};
