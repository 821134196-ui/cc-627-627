# 门店商品试吃样品制作与过敏告知系统

门店向顾客发放试吃样品时，准确告知原料批次与过敏原；批次召回时可追查已发出的样品。

- **后端**：TypeScript + NestJS + Prisma + SQLite
- **前端**：React + Vite
- **打印 / 召回通知**：本地模拟（打印可一键模拟失败；召回通知写 `backend/data/recall-notices.log`）

## 一条命令启动

```bash
npm run setup   # 首次：安装依赖、建库、写入种子数据
npm run dev     # 同时启动后端(3001)与前端(5173)
```

打开 http://localhost:5173 即可使用。后端接口见 http://localhost:3001/api/workbench 。

业务规则自动校验：

```bash
npm run check   # 35 项端到端断言（独立 check.db，不污染开发库）
```

## 业务流程

```
制作人登记(原料批次+制作时间+发放截止)
        │  过敏原在制作瞬间从批次复制为快照
        ▼
打印过敏告知牌 ──失败──► 立即停止(PRINT_FAILED)
        │ 成功                    ▲ 打印机恢复可重打，但旧核对作废
        ▼                         │ 必须重新核对
巡查员核对告知牌与实物一致（独立经手人）
        │ 不一致（如过敏原标错）─► 立即停止(INSPECTION_FAILED)，禁止重打标签恢复，只能新建样品
        ▼
   可以发放（试吃台登记份数与经手人，记录冗余批次号）
        │
        ▼
到达发放截止时间 ──► 定时任务自动停止(EXPIRED)；门禁函数对到期实时双重拦截
原料批次召回   ──► 该批次在架样品全部停止(RECALLED)，已发记录保留可追溯
```

## 关键规则落点

| 规则 | 实现 |
| --- | --- |
| 打印失败阻止发放 | `printLabel(forceFail)` 写入失败 PrintJob 并置 STOPPED；`evaluateServeGate` 对失败/未打印一律拒绝（409） |
| 超时阻止发放 | 每 15s `expireDueSamples` 自动停止；发放时门禁再按当前时间实时判断，即使库状态滞后也拦 |
| 换批次必须重新核对 | 系统只有“新建样品”入口，无修改批次入口；新样品自带新批次过敏原快照、无打印/核对记录，必须重新走打印+核对 |
| 不能只改标签文字恢复 | 过敏原为制作时快照（`allergenSnapshot`），无编辑接口；核对不合格的样品禁止重打；打印失败重打成功也回到待核对 |
| 已发记录关联批次 | `DistributionRecord` 冗余 `batchCode` 与过敏原快照，样品停止/批次召回均不删除记录；`GET /api/trace?batch=` 追查 |
| 制作/巡查分人记录 | 员工分 MAKER / INSPECTOR / SERVER 角色，样品存 maker、Inspection 存 inspector、发放记录存 server |

## 主要接口

- `GET  /api/workbench` 工作台三栏：待核对 / 可以发放 / 已停止（含实时 `serveAllowed`）
- `POST /api/samples` 制作登记
- `POST /api/samples/:id/print` 打印告知牌（`{"forceFail":true}` 模拟打印失败）
- `POST /api/samples/:id/inspect` 巡查核对
- `POST /api/samples/:id/distribute` 试吃台发放（被门禁拦截返回 409）
- `POST /api/samples/:id/stop` 手动停止
- `POST /api/batches/:id/recall` 批次召回（停样品 + 本地通知存档）
- `GET  /api/trace?batch=批次号或ID` 批次追溯：样品清单 + 已发记录 + 经手人

## 数据

- 开发库：`backend/data/app.db`（`npm run setup` 时创建，含 3 名员工、3 个原料批次）
- 校验库：`backend/data/check.db`（`npm run check` 自动重建）
- 召回通知：`backend/data/recall-notices.log`
