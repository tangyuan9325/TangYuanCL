/**
 * 内置 CurseForge API Key。
 *
 * 上游 TangYuanCL 在这里硬编码了它为自己注册的应用凭证（$2a$10$…）。
 * 那是属于另一个项目的凭证：拿到本启动器里用既不符合 CurseForge 的应用凭证约定，
 * 也可能随时被吊销而静默失效。因此本分支置空，走 community.ts 已有的无 key 降级通道（MCIM 镜像）。
 *
 * 需要官方通道时，请在「设置 → 社区」填入自己申请的 Key（环境变量 TANGYUANCL_CF_API_KEY 亦可）。
 */
export const CF_BUILTIN_KEY = ''
