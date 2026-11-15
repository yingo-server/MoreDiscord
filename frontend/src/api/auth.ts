import { api } from "./client"
import type { SignupReq, SignupRes, VerifyReq, VerifyRes, LoginReq, LoginRes, User } from "@/types/api"

export async function signup(data: SignupReq): Promise<SignupRes> {
  return api.post<SignupRes>("/auth/signup", data)
}

export async function verify(data: VerifyReq): Promise<VerifyRes> {
  return api.post<VerifyRes>("/auth/verify", data)
}

export async function login(data: LoginReq): Promise<LoginRes> {
  return api.post<LoginRes>("/auth/login", data)
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout")
}

export async function recover(email: string): Promise<void> {
  await api.post("/auth/recover", { email })
}

export async function getMe(): Promise<User> {
  return api.get<User>("/auth/me")
}
