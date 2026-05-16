---
title: "Hermes Agent 源码深度技术解读"
date: 2026-05-05
excerpt: "从对话循环、工具注册表、多 API 适配、上下文压缩、记忆系统、CLI/TUI/Gateway 到插件机制，系统梳理 Hermes Agent 的源码架构。"
categories: ["技术", "源码阅读"]
tags: ["agent", "engineering", "architecture", "hermes", "source-code"]
source: "Hermes Agent source code, /Volumes/data/github/hermes-agent"
---

> 基于 2026 年 5 月源码快照  
> 约 346,620 行 Python + 293 个 TypeScript/TSX 文件  
> 核心代码库约 449 个 Python 文件

---

## 1. 项目概览与规模

### 1.1 整体规模

| 指标 | 数值 |
|------|------|
| Python 总代码行 | ~346,620 |
| Python 文件数 | ~449 |
| TypeScript/TSX 文件数 | ~293 |
| 测试文件数 | ~945 |
| 核心目录数 | 12+ |

### 1.2 核心目录结构

```
hermes-agent/
├── run_agent.py          # AIAgent 核心类 — 对话循环 (~14,306 LOC)
├── cli.py                # HermesCLI — 交互式 CLI (~12,275 LOC)
├── model_tools.py        # 工具编排层 — 发现、调用、过滤 (~847 LOC)
├── toolsets.py           # 工具集定义与解析 (~834 LOC)
├── hermes_state.py       # SessionDB — SQLite 持久化 + FTS5 搜索 (~2,630 LOC)
├── hermes_logging.py     # 日志系统 — profile-aware 路径 (~389 LOC)
├── hermes_constants.py   # get_hermes_home() — 配置路径解析 (~345 LOC)
├── batch_runner.py       # 并行批处理 (~1,287 LOC)
├── trajectory_compressor.py # 轨迹压缩 (~1,508 LOC)
│
├── agent/                # Agent 内部模块 (57 files, ~33,982 LOC)
│   ├── prompt_builder.py      # 系统提示组装、上下文文件扫描
│   ├── context_compressor.py # 自动上下文压缩
│   ├── auxiliary_client.py   # 辅助模型客户端
│   ├── anthropic_adapter.py  # Anthropic API 适配
│   ├── codex_responses_adapter.py # OpenAI Codex 适配
│   ├── bedrock_adapter.py    # AWS Bedrock 适配
│   ├── gemini_native_adapter.py # Gemini 适配
│   ├── credential_pool.py     # 凭据池与故障转移
│   ├── memory_manager.py      # 记忆管理
│   ├── model_metadata.py      # 模型元数据、上下文长度
│   ├── error_classifier.py    # API 错误分类
│   ├── tool_guardrails.py     # 工具调用护栏
│   └── ...
│
├── tools/                # 工具实现 (87 files, ~59,607 LOC)
│   ├── registry.py            # 中央注册表 — 自发现机制
│   ├── terminal_tool.py      # 终端后端 (local/docker/ssh/modal/daytona/singularity)
│   ├── browser_tool.py        # 浏览器自动化 (CDP/Supervisor)
│   ├── delegate_tool.py       # 子代理委派
│   ├── mcp_tool.py           # MCP 工具集成
│   ├── skills_hub.py         # 技能系统
│   ├── file_tools.py         # 文件操作
│   ├── web_tools.py          # 网络搜索/提取
│   └── ...
│
├── hermes_cli/           # CLI 子命令 (66 files, ~74,231 LOC)
│   ├── main.py               # CLI 入口
│   ├── commands.py           # 斜杠命令注册表
│   ├── config.py             # 配置管理
│   ├── auth.py               # 认证系统
│   ├── gateway.py            # 网关启动
│   ├── web_server.py         # Dashboard Web 服务器
│   ├── models.py             # 模型目录管理
│   └── ...
│
├── gateway/              # 消息网关 (56 files, ~72,606 LOC)
│   ├── run.py                # 网关主循环 (~14,943 LOC)
│   ├── platforms/            # 平台适配器
│   │   ├── telegram.py
│   │   ├── discord.py
│   │   ├── slack.py
│   │   ├── feishu.py
│   │   ├── weixin.py
│   │   ├── wecom.py
│   │   ├── matrix.py
│   │   ├── signal.py
│   │   ├── qqbot/
│   │   ├── api_server.py
│   │   └── ...
│   └── builtin_hooks/        # 网关钩子扩展点
│
├── ui-tui/               # Ink React TUI (293 ts/tsx files)
│   └── src/
│       ├── app.tsx           # 主应用组件
│       ├── gatewayClient.ts  # JSON-RPC 网关客户端
│       └── components/       # Ink 组件
│
├── tui_gateway/          # TUI Python 后端 (8 files, ~6,223 LOC)
│   └── server.py             # JSON-RPC 服务器
│
├── cron/                 # 调度器 (3 files)
│
├── plugins/              # 插件系统 (48 files)
│   ├── memory/               # 记忆提供者插件
│   ├── context_engine/       # 上下文引擎插件
│   └── ...
│
├── skills/               # 内置技能 (43 files)
│
├── environments/         # RL 训练环境 (30 files)
│
└── tests/                # 测试套件 (~945 files)
```

---

## 2. 核心架构：AIAgent 与对话循环

### 2.1 AIAgent 类 — 入口与初始化

```python
class AIAgent:
    def __init__(
        self,
        base_url: str = None,
        api_key: str = None,
        provider: str = None,
        api_mode: str = None,        # "chat_completions" | "codex_responses" | "anthropic_messages" | "bedrock_converse"
        model: str = "",
        max_iterations: int = 90,
        enabled_toolsets: list = None,
        disabled_toolsets: list = None,
        quiet_mode: bool = False,
        save_trajectories: bool = False,
        platform: str = None,
        session_id: str = None,
        skip_context_files: bool = False,
        skip_memory: bool = False,
        credential_pool=None,
        # ... 60+ 参数
    )
```

**关键设计**：
- **懒加载 OpenAI SDK**：`_OpenAIProxy` 代理对象，首次调用时才导入（节省 ~240ms 启动时间）
- **SafeWriter**：包装 stdout/stderr，捕获 broken pipe 错误（systemd/Docker 环境下防止崩溃）
- **API 模式自动检测**：根据 base_url 和 provider 自动选择 chat_completions / codex_responses / anthropic_messages / bedrock_converse
- **Prompt Caching 自动启用**：Claude 模型在 Anthropic/OpenRouter/兼容网关自动启用，降低 ~75% 输入成本

### 2.2 run_conversation — 主对话循环

```python
def run_conversation(self, user_message, system_message=None, 
                     conversation_history=None, task_id=None) -> dict:
```

**循环结构**（简化）：
```
while (api_call_count < max_iterations and iteration_budget.remaining > 0) 
        or budget_grace_call:
    
    if interrupt_requested: break
    
    # 1. 预检压缩（上下文超限则主动压缩）
    # 2. 构建 API 消息（注入记忆、插件上下文、prefill）
    # 3. 应用 Anthropic prompt caching
    # 4. 清理 API 消息（移除内部字段、修复损坏的 tool_call 参数）
    # 5. 调用模型（streaming 或 blocking）
    # 6. 处理响应（提取 assistant 消息、reasoning、tool_calls）
    # 7. 执行工具（串行或并行）
    # 8. 检查中断、预算、重试条件
    # 9. 继续下一轮
```

**关键机制**：
- **IterationBudget**：线程安全的迭代计数器，支持 refund（execute_code 不计入预算）
- **Grace Call**：预算耗尽后给模型最后一次机会生成总结
- **Interrupt 机制**：支持用户中断（新消息）、/steer 注入、子代理中断传播
- **Tool 并行执行**：`_should_parallelize_tool_batch` 分析工具调用安全性，并发执行读操作

### 2.3 工具调用执行

**并行判定规则**：
```python
_NEVER_PARALLEL_TOOLS = frozenset({"clarify"})
_PARALLEL_SAFE_TOOLS = frozenset({"read_file", "search_files", "web_search", ...})
_PATH_SCOPED_TOOLS = frozenset({"read_file", "write_file", "patch"})
```

- **clarify** 永远串行（交互式）
- **读操作** 可并发（无状态副作用）
- **文件操作** 按路径分析冲突（同路径串行，不同路径并发）
- **最大并发数**：8 个 worker 线程

---

## 3. 工具系统：注册表架构

### 3.1 自发现注册机制

```python
# tools/registry.py — 无依赖，被所有工具文件导入

def discover_builtin_tools(tools_dir=None) -> List[str]:
    """通过 AST 扫描检测哪些模块包含 registry.register() 调用"""
    module_names = [
        f"tools.{path.stem}"
        for path in sorted(tools_path.glob("*.py"))
        if path.name not in {"__init__.py", "registry.py"}
        and _module_registers_tools(path)  # AST 检查
    ]
    # 动态导入注册
```

**设计要点**：
- **AST 扫描**：避免导入无工具模块，减少启动开销
- **TTL 缓存**：`check_fn` 结果缓存 30 秒（探测 Docker/Modal/Playwright 等外部状态）
- **Generation 计数器**：注册表变更时递增，支持 `get_tool_definitions` 的 memoization
- **线程安全**：RRlock 保护读写，快照机制保证遍历一致性

### 3.2 ToolEntry 结构

```python
class ToolEntry:
    __slots__ = (
        "name", "toolset", "schema", "handler", "check_fn",
        "requires_env", "is_async", "description", "emoji",
        "max_result_size_chars",
    )
```

### 3.3 工具定义缓存

```python
# model_tools.py — 基于 (enabled_toolsets, disabled_toolsets, registry_generation, config_mtime) 的 memoization
_tool_defs_cache: Dict[tuple, List[Dict]] = {}
```

---

## 4. 多 API 适配层

### 4.1 支持的 API 模式

| api_mode | 说明 | 适配器位置 |
|----------|------|-----------|
| chat_completions | OpenAI 标准格式 | 原生 OpenAI 客户端 |
| codex_responses | OpenAI Codex / xAI | agent/codex_responses_adapter.py |
| anthropic_messages | Anthropic Messages API | agent/anthropic_adapter.py |
| bedrock_converse | AWS Bedrock | agent/bedrock_adapter.py |

### 4.2 自动升级逻辑

GPT-5.x 模型在直接 OpenAI URL 上自动升级到 codex_responses：
```python
if (api_mode is None 
    and self.api_mode == "chat_completions"
    and not self._is_azure_openai_url()
    and (self._is_direct_openai_url() 
         or self._provider_model_requires_responses_api(model))):
    self.api_mode = "codex_responses"
```

### 4.3 响应验证与故障转移

每种 api_mode 有独立的 `validate_response` 逻辑：
- **codex_responses**：检查 status 字段（failed/cancelled → 触发 fallback）
- **anthropic_messages**：验证 content 为非空列表
- **bedrock_converse**：检查 output/choices 存在性

---

## 5. 上下文压缩系统

### 5.1 ContextCompressor

```python
class ContextCompressor:
    def __init__(self, model: str, api_key: str = None, base_url: str = None):
        # 使用辅助模型（便宜/快速）进行总结
        # 保护头部 N 条消息 + 尾部 N 条消息（按 token 预算而非固定数量）
```

**压缩策略**：
1. **预检压缩**：进入主循环前检查上下文是否超限
2. **工具输出剪枝**：先清除旧工具输出（低成本）
3. **LLM 总结**：用辅助模型压缩中间轮次
4. **迭代更新**：保留跨多次压缩的信息
5. **摘要预算**：按压缩内容的 20% 分配，最高上限封顶

### 5.2 压缩触发条件

```python
_preflight_tokens = estimate_request_tokens_rough(
    messages, system_prompt=..., tools=...
)
if _preflight_tokens >= threshold_tokens:
    # 触发压缩，最多 3 轮
```

---

## 6. 记忆系统

### 6.1 三层记忆架构

```
┌─────────────────────────────────────────┐
│  Session Transcripts（SQLite）           │
│  - 完整对话历史，支持 /resume 恢复         │
├─────────────────────────────────────────┤
│  External Memory Providers（插件）        │
│  - mem0, honcho, supermemory 等          │
│  - 通过 MemoryManager 统一接口             │
├─────────────────────────────────────────┤
│  Context Files（项目级）                  │
│  - AGENTS.md, SOUL.md, .cursorrules      │
│  - .hermes.md — 项目特定指令              │
└─────────────────────────────────────────┘
```

### 6.2 MemoryManager

- **prefetch_all**：在对话循环前预取外部记忆（缓存复用）
- **on_turn_start**：通知记忆提供者新 turn 开始
- **注入位置**：用户消息中（非 system prompt），保护 prompt cache prefix

### 6.3 上下文文件安全扫描

```python
_CONTEXT_THREAT_PATTERNS = [
    (r'ignore\s+(previous|all|above|prior)\s+instructions', "prompt_injection"),
    (r'do\s+not\s+tell\s+the\s+user', "deception_hide"),
    (r'system\s+prompt\s+override', "sys_prompt_override"),
    # ... 共 10+ 种攻击模式
]
```

---

## 7. CLI 架构

### 7.1 HermesCLI — 交互式终端

```python
class HermesCLI:
    def __init__(self, model=None, toolsets=None, provider=None, ...):
        # Rich console + prompt_toolkit 双驱动
        # 支持 streaming、reasoning 显示、inline diff
```

**显示模式**：
- **streaming**：实时 token 流（config.yaml `display.streaming`）
- **tool_progress**：工具执行进度（off/new/all/verbose）
- **reasoning**：模型思考过程显示
- **inline_diffs**：写操作的内联差异预览

### 7.2 斜杠命令系统

```python
# hermes_cli/commands.py — 中央注册表

@dataclass(frozen=True)
class CommandDef:
    name: str
    description: str
    category: str
    aliases: tuple[str, ...] = ()
    cli_only: bool = False
    gateway_only: bool = False
    gateway_config_gate: str | None = None

COMMAND_REGISTRY: list[CommandDef] = [
    CommandDef("new", "Start a new session", "Session", aliases=("reset",)),
    CommandDef("background", "Run in background", "Session", aliases=("bg", "btw")),
    # ... 50+ 命令
]
```

**设计要点**：
- 单一数据源：CLI、Gateway、Telegram BotCommand、Slack 子命令均从 `COMMAND_REGISTRY` 派生
- 添加命令只需修改 `COMMAND_REGISTRY`，所有消费者自动更新
- 别名支持：添加别名无需修改其他文件

### 7.3 皮肤引擎

```python
# hermes_cli/skin_engine.py — 数据驱动主题
# 从 config.yaml `display.skin` 加载
# 自定义 banner 颜色、spinner 表情、工具前缀、响应框样式
```

---

## 8. TUI 架构

### 8.1 进程模型

```
hermes --tui
  └─ Node (Ink/React) ←→ Python (tui_gateway/server.py)
       │                    └─ AIAgent + tools + sessions
       └─ 渲染 transcript、composer、activity
```

### 8.2 JSON-RPC 传输

- **Transport**：StdioTransport（newline-delimited JSON）
- **方法目录**：prompt.submit、tool.start/progress/complete、approval.request/respond、session.list/resume 等
- **Slash Worker**：持久化子进程处理斜杠命令（避免阻塞主循环）

### 8.3 异步 RPC 线程池

```python
_LONG_HANDLERS = frozenset({
    "browser.manage", "cli.exec", "session.branch", "session.compress",
    "session.resume", "shell.exec", "skills.manage", "slash.exec",
})
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="tui-rpc")
```

---

## 9. Gateway 架构

### 9.1 GatewayRunner — 多平台消息网关

```python
# gateway/run.py — 网关主循环 (~14,943 LOC)

class GatewayRunner:
    def __init__(self):
        # 平台适配器管理
        # AIAgent 缓存（LRU + 空闲 TTL 驱逐）
        # 自动恢复机制（resume_pending / tool-tail）
```

**关键设计**：
- **AIAgent 缓存**：最大 128 个实例，空闲 1 小时驱逐
- **自动恢复**：检测到中断后自动继续对话（ freshness 窗口默认 1 小时）
- **Freshness 门控**：防止陈旧会话在网关重启后被错误恢复

### 9.2 平台适配器

每个平台一个适配器文件：
- **telegram.py** (~3,663 LOC)：Bot API、命令解析、话题支持
- **discord.py** (~4,686 LOC)：Discord.py 封装、斜杠命令、Embed
- **slack.py** (~2,926 LOC)：Bolt 框架、Block Kit、Home Tab
- **feishu.py** (~4,804 LOC)：飞书开放平台、事件订阅
- **weixin.py** (~2,110 LOC)：微信公众号/企业号
- **matrix.py** (~2,676 LOC)：Matrix 协议
- **api_server.py** (~3,063 LOC)：REST API 服务器

### 9.3 消息路由

```python
# 统一消息格式
{
    "text": str,
    "chat_id": str,
    "user_id": str,
    "platform": str,
    "timestamp": float,
    "reply_to": str | None,
    "attachments": list,
}
```

---

## 10. 插件系统

### 10.1 三层架构

```
┌─────────────────────────────────────────┐
│  意图层：config.yaml / 环境变量            │
├─────────────────────────────────────────┤
│  物化层：~/.hermes/plugins/              │
├─────────────────────────────────────────┤
│  活动层：运行时工具/技能/钩子              │
└─────────────────────────────────────────┘
```

### 10.2 钩子系统

```python
# hermes_cli/plugins.py

invoke_hook("on_session_start", session_id=..., model=..., platform=...)
invoke_hook("pre_llm_call", session_id=..., user_message=..., ...)
```

**钩子类型**：
- `on_session_start`：新会话初始化
- `pre_llm_call`：每次 API 调用前注入上下文
- `post_tool_use`：工具执行后处理

### 10.3 记忆提供者插件

```python
# plugins/memory/
# - mem0：基于 mem0 的记忆系统
# - honcho：用户级记忆隔离
# - supermemory：向量记忆检索
```

---

## 11. 关键工程实践

### 11.1 数据清理与防御

**Surrogate 清理**：防止剪贴板粘贴的富文本中的孤立代理码点崩溃 JSON 序列化
```python
def _sanitize_surrogates(text: str) -> str:
    return _SURROGATE_RE.sub('\ufffd', text)
```

**Tool Call 参数修复**：处理本地模型产生的截断 JSON、尾随逗号、Python None
```python
def _repair_tool_call_arguments(raw_args: str, tool_name: str = "?") -> str:
    # 5 级修复：strict=False → 去尾随逗号 → 补全括号 → 转义控制字符 → 回退空对象
```

**非 ASCII 清理**：LANG=C 环境下的最后防线
```python
def _sanitize_messages_non_ascii(messages: list) -> bool:
    # 递归清理所有字符串字段
```

### 11.2 错误处理与重试

**API 错误分类**：
```python
# agent/error_classifier.py
class FailoverReason(Enum):
    RATE_LIMIT = "rate_limit"
    SERVER_ERROR = "server_error"
    CONTEXT_LENGTH = "context_length"
    AUTH_ERROR = "auth_error"
    # ...
```

**Fallback 链**：
- 主模型失败 → 尝试 fallback_model
- 凭据池轮换（多 key 场景）
- 指数退避 + 抖动

### 11.3 日志系统

```python
# hermes_logging.py

setup_logging(hermes_home=...)  # agent.log (INFO+), errors.log (WARNING+)
# Profile-aware：不同 profile 的日志隔离
# 会话上下文：hermes logs --session <id> 过滤
```

---

## 12. 代码级深潜：run_conversation 核心循环

run_conversation 方法位于 run_agent.py 第 10478 行起，是 Hermes Agent 的心脏。以下是其核心结构的逐层拆解。

### 12.1 循环入口与预算检查

```python
while (api_call_count < self.max_iterations and self.iteration_budget.remaining > 0) \
        or self._budget_grace_call:
    if self._interrupt_requested:
        break
```

**关键设计**：
- `iteration_budget.remaining` 是线程安全的原子计数器
- `_budget_grace_call` 是布尔标志，预算耗尽后给模型最后一次机会生成总结
- `_interrupt_requested` 支持多线程中断（用户新消息、/steer 注入、子代理中断传播）

### 12.2 预检压缩（第 10500-10600 行）

```python
_preflight_tokens = estimate_request_tokens_rough(
    messages, system_prompt=system_prompt, tools=tools
)
if _preflight_tokens >= threshold_tokens:
    # 触发压缩，最多 3 轮
    for compression_attempt in range(3):
        compressed = self._compress_context(messages)
        if compressed:
            messages = compressed
            break
```

**压缩策略优先级**：
1. 工具输出剪枝（低成本，无 LLM 调用）
2. 旧消息总结（使用辅助模型，便宜/快速）
3. 迭代更新（保留跨多次压缩的信息）

### 12.3 API 消息构建（第 10600-10750 行）

```python
api_messages = self._build_api_messages(
    messages, 
    system_prompt=system_prompt,
    inject_memory=True,
    inject_plugins=True,
    apply_prefill=True,
)
```

**构建步骤**：
1. **记忆注入**：从 MemoryManager.prefetch_all() 获取外部记忆，插入用户消息中（非 system prompt，保护 prompt cache prefix）
2. **插件上下文**：invoke_hook("pre_llm_call") 允许插件注入额外上下文
3. **Prefill 消息**：支持预设 assistant 消息（用于强制模型以特定格式开头）
4. **Anthropic Prompt Caching**：自动为 system prompt 和前几轮消息添加 `cache_control` 标记

### 12.4 消息清理（第 10750-10850 行）

```python
# 移除内部字段（_hermes_* 前缀）
# 修复损坏的 tool_call 参数（本地模型常产生截断 JSON）
# 非 ASCII 清理（LANG=C 环境下的最后防线）
```

**Tool Call 参数修复**（5 级修复链）：
```python
def _repair_tool_call_arguments(raw_args: str, tool_name: str = "?") -> str:
    # Level 1: json.loads(strict=False) — 允许控制字符
    # Level 2: 去除尾随逗号
    # Level 3: 补全未闭合的括号
    # Level 4: 转义未转义的控制字符
    # Level 5: 回退到空对象 {}（确保 API 不返回 400）
```

### 12.5 模型调用与流式处理（第 10850-11100 行）

```python
# 构建 API kwargs（temperature, max_tokens, tools 等）
api_kwargs = self._build_api_kwargs(api_messages)

# 流式调用（默认启用，即使无消费者 — 用于健康检查）
response = self._interruptible_streaming_api_call(api_kwargs)
```

**流式健康检查**：
- 90 秒 stale-stream 检测（SSE ping 但无数据）
- 60 秒 read timeout
- 支持中断（用户按 Ctrl+C 或发送新消息）

### 12.6 响应处理与工具执行（第 11100-11300 行）

```python
# 提取 assistant 消息
assistant_message = self._extract_assistant_message(response)

# 检查 finish_reason
if finish_reason == "length":
    # 截断处理：请求续写（最多 3 次）
    pass

# 执行工具调用
if tool_calls:
    # 并行判定
    parallel_groups = self._group_parallelizable_tools(tool_calls)
    for group in parallel_groups:
        if len(group) == 1:
            results = [self._execute_tool(group[0])]
        else:
            # 并发执行（ThreadPoolExecutor, max_workers=8）
            results = self._execute_tools_parallel(group)
```

### 12.7 重试与故障转移（第 11300-11500 行）

```python
# 错误分类
try:
    response = client.chat.completions.create(...)
except Exception as e:
    reason = classify_api_error(e)  # RATE_LIMIT / SERVER_ERROR / CONTEXT_LENGTH / AUTH_ERROR
    
    # 故障转移链
    if reason == RATE_LIMIT:
        # 指数退避 + 抖动
        time.sleep(jittered_backoff(retry_count))
    elif reason == SERVER_ERROR:
        # 尝试 fallback provider
        if self._try_activate_fallback():
            retry_count = 0
            continue
    elif reason == CONTEXT_LENGTH:
        # 触发压缩
        messages = self._compress_context(messages)
```

**指数退避公式**：
```python
def jittered_backoff(retry_count, base_delay=5.0, max_delay=120.0):
    delay = min(base_delay * (2 ** retry_count), max_delay)
    jitter = random.uniform(0, delay * 0.3)
    return delay + jitter
```

---

## 13. 代码级深潜：工具注册表

### 13.1 AST 扫描机制

```python
def _module_registers_tools(path: Path) -> bool:
    """通过 AST 检查模块是否包含 registry.register() 调用"""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return False
    
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Attribute):
                if func.attr == "register" and isinstance(func.value, ast.Name):
                    if func.value.id == "registry":
                        return True
    return False
```

**设计理由**：
- 避免导入无工具模块（减少启动时间 ~30%）
- 不执行代码，纯静态分析（安全）
- 支持条件注册（if 语句包裹的 register() 也能检测到）

### 13.2 注册表数据结构

```python
class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolEntry] = {}
        self._toolset_checks: Dict[str, Callable] = {}
        self._toolset_aliases: Dict[str, str] = {}
        self._generation: int = 0  # 变更计数器，用于缓存失效
        self._lock = threading.RLock()
```

**快照机制**（线程安全遍历）：
```python
def _snapshot_entries(self) -> List[ToolEntry]:
    with self._lock:
        return list(self._tools.values())
```

### 13.3 工具定义缓存

```python
# model_tools.py — 基于复合键的 memoization
_tool_defs_cache: Dict[tuple, List[Dict]] = {}

def get_tool_definitions(enabled_toolsets, disabled_toolsets):
    cache_key = (
        frozenset(enabled_toolsets or []),
        frozenset(disabled_toolsets or []),
        registry.generation,
        config_mtime,
    )
    if cache_key in _tool_defs_cache:
        return _tool_defs_cache[cache_key]
    
    # 重新构建定义
    defs = _build_tool_definitions(...)
    _tool_defs_cache[cache_key] = defs
    return defs
```

**缓存失效条件**：
- 注册表变更（generation 递增）
- 配置文件修改（mtime 变化）
- 工具集启用/禁用状态变化

---

## 14. 代码级深潜：Anthropic 适配器

### 14.1 模型能力检测

```python
# agent/anthropic_adapter.py

_ADAPTIVE_THINKING_SUBSTRINGS = ("4-6", "4.6", "4-7", "4.7")
_NO_SAMPLING_PARAMS_SUBSTRINGS = ("4-7", "4.7")

def _supports_adaptive_thinking(model: str) -> bool:
    return any(v in model for v in _ADAPTIVE_THINKING_SUBSTRINGS)

def _supports_sampling_params(model: str) -> bool:
    return not any(v in model for v in _NO_SAMPLING_PARAMS_SUBSTRINGS)
```

**设计理由**：
- Anthropic 不同模型版本行为差异大（4.5 vs 4.6 vs 4.7）
- 4.7 模型禁止 temperature/top_p/top_k（返回 400）
- 4.6+ 支持 adaptive thinking，废弃 manual thinking

### 14.2 消息格式转换

```python
def build_anthropic_messages(messages: List[Dict]) -> List[Dict]:
    """将 OpenAI 格式消息转换为 Anthropic Messages API 格式"""
    anthropic_messages = []
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        
        if role == "system":
            # Anthropic 使用顶层 system 参数，不是消息角色
            continue
        
        if role == "tool":
            # 转换为 tool_result 块
            anthropic_messages.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": msg["tool_call_id"],
                    "content": content,
                }]
            })
        elif role == "assistant":
            # 处理 tool_calls + content
            blocks = []
            if msg.get("tool_calls"):
                for tc in msg["tool_calls"]:
                    blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["function"]["name"],
                        "input": json.loads(tc["function"]["arguments"]),
                    })
            if content:
                blocks.append({"type": "text", "text": content})
            anthropic_messages.append({"role": "assistant", "content": blocks})
        else:
            anthropic_messages.append({"role": role, "content": content})
    
    return anthropic_messages
```

### 14.3 Prompt Caching 自动启用

```python
def _apply_prompt_caching(messages: List[Dict], model: str) -> List[Dict]:
    """为 Claude 模型自动添加 cache_control 标记"""
    if not _is_claude_model(model):
        return messages
    
    # 为 system prompt 和前几轮消息添加 cache_control
    for i, msg in enumerate(messages):
        if i < 4:  # 前 4 条消息标记为缓存点
            msg["content"]["cache_control"] = {"type": "ephemeral"}
    
    return messages
```

**效果**：
- 降低 ~75% 输入 token 成本（缓存命中时）
- 自动检测 Anthropic/OpenRouter/兼容网关
- 无需用户手动配置

---

## 15. 代码级深潜：上下文压缩器

### 15.1 压缩算法

```python
class ContextCompressor:
    def compress(self, messages: List[Dict]) -> List[Dict]:
        # 1. 计算当前 token 数
        current_tokens = self._estimate_tokens(messages)
        
        # 2. 如果未超限，不压缩
        if current_tokens < self.threshold_tokens:
            return messages
        
        # 3. 保护头部消息（system prompt + 前 N 轮）
        protected_head = messages[:self.protect_first_n]
        
        # 4. 保护尾部消息（最近 N 轮，按 token 预算）
        protected_tail = self._protect_tail(messages, budget=self.tail_token_budget)
        
        # 5. 中间部分用辅助模型总结
        middle = messages[self.protect_first_n : -len(protected_tail)]
        summary = self._summarize_with_aux_model(middle)
        
        # 6. 组装：头部 + 总结 + 尾部
        return protected_head + [summary] + protected_tail
```

### 15.2 Token 估算

```python
def _estimate_tokens(self, messages: List[Dict]) -> int:
    """粗略估算 token 数（比 tiktoken 快，无需模型文件）"""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            # 中文字符 ≈ 1.5 tokens，英文 ≈ 0.25 tokens/char
            total += len(content) * 0.5
        elif isinstance(content, list):
            # 多模态消息
            for part in content:
                if part.get("type") == "text":
                    total += len(part["text"]) * 0.5
                elif part.get("type") in ("image_url", "image"):
                    total += 1000  # 图像估算
    return int(total)
```

### 15.3 辅助模型总结

```python
def _summarize_with_aux_model(self, messages: List[Dict]) -> Dict:
    """使用便宜/快速的辅助模型生成总结"""
    # 构建总结提示
    prompt = self._build_summary_prompt(messages)
    
    # 调用辅助模型（默认 gpt-3.5-turbo，可配置）
    summary_text = self.aux_client.chat(prompt)
    
    # 返回为 assistant 消息格式
    return {
        "role": "assistant",
        "content": f"[Previous conversation summarized]: {summary_text}",
        "_hermes_summary": True,  # 标记为总结消息
    }
```

---

## 16. 代码级深潜：记忆系统

### 16.1 MemoryManager 接口

```python
class MemoryManager:
    def __init__(self):
        self.providers: List[MemoryProvider] = []
        self._cache: Dict[str, Any] = {}
    
    def prefetch_all(self, session_id: str, user_id: str) -> Dict[str, Any]:
        """预取所有记忆提供者的数据"""
        memories = {}
        for provider in self.providers:
            key = f"{provider.name}:{session_id}:{user_id}"
            if key in self._cache:
                memories[provider.name] = self._cache[key]
            else:
                data = provider.get_memories(session_id, user_id)
                self._cache[key] = data
                memories[provider.name] = data
        return memories
    
    def on_turn_start(self, session_id: str, turn_number: int):
        """通知所有提供者新 turn 开始"""
        for provider in self.providers:
            provider.on_turn_start(session_id, turn_number)
```

### 16.2 记忆注入位置

```python
def _inject_memories(self, messages: List[Dict], memories: Dict) -> List[Dict]:
    """将记忆注入用户消息中（保护 prompt cache）"""
    # 找到最后一条用户消息
    for i in range(len(messages) - 1, -1, -1):
        if messages[i]["role"] == "user":
            # 注入记忆到用户消息内容中
            memory_text = self._format_memories(memories)
            messages[i]["content"] = f"{memory_text}\n\n{messages[i]['content']}"
            break
    return messages
```

**设计理由**：
- 注入到用户消息中（非 system prompt），保护 Anthropic prompt cache prefix
- system prompt 变更会导致缓存失效，增加成本

---

## 17. 代码级深潜：CLI 架构

### 17.1 HermesCLI 初始化

```python
class HermesCLI:
    def __init__(self, model=None, toolsets=None, provider=None, ...):
        # 1. 加载配置（config.yaml + 环境变量）
        self.config = load_cli_config()
        
        # 2. 初始化 Rich Console（用于 banner、面板）
        self.console = Console()
        
        # 3. 初始化 prompt_toolkit（用于输入、自动补全）
        self.session = PromptSession(
            completer=SlashCommandCompleter(),
            history=FileHistory(str(hermes_home / ".cli_history")),
        )
        
        # 4. 初始化 AIAgent
        self.agent = AIAgent(
            model=model or self.config["model"],
            toolsets=toolsets or self.config["toolsets"],
            provider=provider or self.config["provider"],
            ...
        )
        
        # 5. 加载皮肤
        self.skin = load_skin(self.config.get("display", {}).get("skin"))
```

### 17.2 斜杠命令处理

```python
def process_command(self, cmd: str):
    """处理斜杠命令"""
    # 解析命令
    canonical, args = resolve_command(cmd)
    
    # 分类处理
    if canonical == "new":
        self._handle_new()
    elif canonical == "model":
        self._handle_model(args)
    elif canonical == "tools":
        self._handle_tools(args)
    elif canonical == "background":
        self._handle_background(args)
    # ... 50+ 命令
```

### 17.3 皮肤引擎

```python
class SkinEngine:
    def __init__(self, skin_data: Dict):
        self.banner_colors = skin_data.get("banner", ["cyan", "blue"])
        self.spinner_faces = skin_data.get("spinner", {
            "thinking": "(◔_◔)",
            "working": "(｀・ω・´)",
            "done": "(✿◠‿◠)",
        })
        self.tool_prefix = skin_data.get("tool_prefix", "⚡")
        self.response_box = skin_data.get("response_box", "rounded")
```

---

## 18. 代码级深潜：TUI 架构

### 18.1 JSON-RPC 协议

```typescript
// ui-tui/src/gatewayClient.ts

interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: any;
}

interface JSONRPCEvent {
  jsonrpc: "2.0";
  method: string;
  params: any;
}

class GatewayClient {
  private transport: StdioTransport;
  private pendingRequests: Map<number, Deferred>;
  
  async call(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const request: JSONRPCRequest = { jsonrpc: "2.0", id, method, params };
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.transport.send(JSON.stringify(request) + "\n");
    });
  }
  
  onEvent(method: string, handler: (params: any) => void) {
    this.eventHandlers.set(method, handler);
  }
}
```

### 18.2 Python JSON-RPC 后端

```python
# tui_gateway/server.py

class TuiGatewayServer:
    def __init__(self):
        self.agent = AIAgent(...)
        self.pool = ThreadPoolExecutor(max_workers=4)
    
    def handle_request(self, request: Dict) -> Dict:
        method = request["method"]
        params = request.get("params", {})
        
        if method == "prompt.submit":
            return self._handle_prompt_submit(params)
        elif method == "session.list":
            return self._handle_session_list(params)
        elif method == "slash.exec":
            return self._handle_slash_exec(params)
        # ... 20+ 方法
    
    def _handle_prompt_submit(self, params: Dict) -> Dict:
        """处理用户消息提交"""
        message = params["message"]
        session_id = params.get("session_id")
        
        # 设置流式回调
        self.agent.streaming_callback = lambda chunk: self._emit_delta(chunk)
        
        # 运行对话
        result = self.agent.run_conversation(message, session_id=session_id)
        
        return {"final_response": result["final_response"]}
```

### 18.3 Slash Worker

```python
class SlashWorker:
    """持久化子进程，处理耗时的斜杠命令"""
    
    def __init__(self):
        self.process = subprocess.Popen(
            [sys.executable, "-m", "tui_gateway.slash_worker"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    
    def execute(self, command: str, args: List[str]) -> Dict:
        """向 worker 发送命令并等待结果"""
        request = {"command": command, "args": args}
        self.process.stdin.write(json.dumps(request).encode() + b"\n")
        self.process.stdin.flush()
        
        response = self.process.stdout.readline()
        return json.loads(response)
```

---

## 19. 代码级深潜：Gateway 架构

### 19.1 GatewayRunner 初始化

```python
class GatewayRunner:
    def __init__(self):
        # 平台适配器管理
        self.adapters: Dict[str, PlatformAdapter] = {}
        
        # AIAgent 缓存（LRU + 空闲 TTL 驱逐）
        self.agent_cache = LRUCache(maxsize=128)
        self.agent_last_used: Dict[str, float] = {}
        
        # 自动恢复机制
        self.resume_pending: Dict[str, Dict] = {}
        self.freshness_window = 3600  # 1 小时
    
    async def run(self):
        """主循环"""
        # 启动所有平台适配器
        for adapter in self.adapters.values():
            await adapter.start()
        
        # 处理消息
        while True:
            message = await self.message_queue.get()
            await self._handle_message(message)
```

### 19.2 AIAgent 缓存管理

```python
def _get_agent(self, chat_id: str, user_id: str) -> AIAgent:
    """获取或创建 AIAgent 实例"""
    cache_key = f"{chat_id}:{user_id}"
    
    # 检查缓存
    if cache_key in self.agent_cache:
        agent = self.agent_cache[cache_key]
        self.agent_last_used[cache_key] = time.time()
        return agent
    
    # 创建新实例
    agent = AIAgent(
        platform="telegram",  # 或其他平台
        session_id=cache_key,
        ...
    )
    
    # 存入缓存
    self.agent_cache[cache_key] = agent
    self.agent_last_used[cache_key] = time.time()
    
    return agent

def _evict_idle_agents(self):
    """驱逐空闲超时的 AIAgent"""
    now = time.time()
    for cache_key, last_used in list(self.agent_last_used.items()):
        if now - last_used > 3600:  # 1 小时空闲
            del self.agent_cache[cache_key]
            del self.agent_last_used[cache_key]
```

### 19.3 自动恢复机制

```python
async def _handle_message(self, message: Dict):
    """处理传入消息"""
    chat_id = message["chat_id"]
    text = message["text"]
    
    # 检查是否有待恢复的对话
    if chat_id in self.resume_pending:
        pending = self.resume_pending[chat_id]
        
        # 检查 freshness
        if time.time() - pending["timestamp"] < self.freshness_window:
            # 恢复对话
            agent = self._get_agent(chat_id, message["user_id"])
            agent.load_session(pending["messages"])
            
            # 发送恢复提示
            await self._send_message(chat_id, "Resuming previous conversation...")
        
        del self.resume_pending[chat_id]
    
    # 正常处理消息
    agent = self._get_agent(chat_id, message["user_id"])
    result = agent.run_conversation(text)
    
    # 发送响应
    await self._send_message(chat_id, result["final_response"])
```

### 19.4 平台适配器基类

```python
class PlatformAdapter(ABC):
    @abstractmethod
    async def start(self):
        """启动适配器（连接平台 API）"""
        pass
    
    @abstractmethod
    async def stop(self):
        """停止适配器"""
        pass
    
    @abstractmethod
    async def send_message(self, chat_id: str, text: str, **kwargs):
        """发送消息到平台"""
        pass
    
    @abstractmethod
    async def send_typing(self, chat_id: str):
        """发送 typing 状态"""
        pass
    
    @abstractmethod
    def parse_message(self, raw_message: Any) -> Dict:
        """解析平台原生消息为统一格式"""
        pass
```

---

## 20. 代码级深潜：插件系统

### 20.1 插件加载

```python
def load_plugins(plugins_dir: Path) -> List[Plugin]:
    """加载所有插件"""
    plugins = []
    
    for plugin_dir in plugins_dir.iterdir():
        if not plugin_dir.is_dir():
            continue
        
        # 读取 plugin.yaml
        config_path = plugin_dir / "plugin.yaml"
        if not config_path.exists():
            continue
        
        with open(config_path) as f:
            config = yaml.safe_load(f)
        
        # 导入插件模块
        module_path = plugin_dir / "__init__.py"
        if module_path.exists():
            spec = importlib.util.spec_from_file_location(
                plugin_dir.name, module_path
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            # 初始化插件
            plugin = module.Plugin(config)
            plugins.append(plugin)
    
    return plugins
```

### 20.2 钩子注册与调用

```python
class PluginManager:
    def __init__(self):
        self.hooks: Dict[str, List[Callable]] = {}
    
    def register_hook(self, hook_name: str, handler: Callable):
        """注册钩子处理器"""
        if hook_name not in self.hooks:
            self.hooks[hook_name] = []
        self.hooks[hook_name].append(handler)
    
    def invoke_hook(self, hook_name: str, **kwargs) -> List[Any]:
        """调用所有注册的钩子处理器"""
        results = []
        for handler in self.hooks.get(hook_name, []):
            try:
                result = handler(**kwargs)
                results.append(result)
            except Exception as e:
                logger.error(f"Hook {hook_name} error: {e}")
        return results
```

### 20.3 记忆提供者插件接口

```python
class MemoryProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """提供者名称"""
        pass
    
    @abstractmethod
    def get_memories(self, session_id: str, user_id: str) -> List[Dict]:
        """获取用户的记忆"""
        pass
    
    @abstractmethod
    def add_memory(self, session_id: str, user_id: str, memory: Dict):
        """添加记忆"""
        pass
    
    @abstractmethod
    def on_turn_start(self, session_id: str, turn_number: int):
        """新 turn 开始时的回调"""
        pass
```

---

## 21. 代码级深潜：关键工程实践

### 21.1 数据清理链

```python
def sanitize_message_content(content: Any) -> Any:
    """完整的消息内容清理链"""
    if isinstance(content, str):
        # 1. 清理孤立代理码点
        content = _sanitize_surrogates(content)
        # 2. 清理非 ASCII（LANG=C 环境）
        content = _sanitize_non_ascii(content)
        # 3. 清理控制字符
        content = _sanitize_control_chars(content)
    elif isinstance(content, list):
        # 递归清理多模态内容
        for part in content:
            if part.get("type") == "text":
                part["text"] = sanitize_message_content(part["text"])
    return content
```

### 21.2 错误分类器

```python
class ErrorClassifier:
    PATTERNS = {
        FailoverReason.RATE_LIMIT: [
            r"rate limit",
            r"too many requests",
            r"429",
        ],
        FailoverReason.SERVER_ERROR: [
            r"internal server error",
            r"bad gateway",
            r"502",
            r"503",
        ],
        FailoverReason.CONTEXT_LENGTH: [
            r"context length",
            r"maximum context",
            r"too long",
        ],
        FailoverReason.AUTH_ERROR: [
            r"authentication",
            r"unauthorized",
            r"401",
        ],
    }
    
    @classmethod
    def classify(cls, error: Exception) -> FailoverReason:
        error_str = str(error).lower()
        for reason, patterns in cls.PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, error_str):
                    return reason
        return FailoverReason.UNKNOWN
```

### 21.3 日志系统

```python
class HermesLogger:
    def __init__(self, hermes_home: Path):
        self.hermes_home = hermes_home
        self.logs_dir = hermes_home / "logs"
        self.logs_dir.mkdir(exist_ok=True)
        
        # 配置根日志器
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            handlers=[
                logging.FileHandler(self.logs_dir / "agent.log"),
                logging.FileHandler(self.logs_dir / "errors.log"),
            ],
        )
        
        # 错误日志只记录 WARNING+
        error_handler = logging.FileHandler(self.logs_dir / "errors.log")
        error_handler.setLevel(logging.WARNING)
```

---

## 22. 与 Claude Code 的对比

| 维度 | Hermes Agent | Claude Code |
|------|-------------|-------------|
| **语言** | Python (346K LOC) | TypeScript (512K LOC) |
| **架构** | 模块化，registry 自发现 | 单体，显式导入 |
| **API 支持** | 4 种模式自动切换 | 主要是 Anthropic Messages |
| **平台** | 15+ 消息平台 | CLI + Bridge/Swarm |
| **TUI** | Ink React + Python 后端 | 内嵌自定义 Ink Reconciler |
| **记忆** | 插件化（mem0/honcho/supermemory） | 三层（Session/Team/Auto） |
| **压缩** | 辅助模型总结 | 四层管线（snip/micro/autocompact/collapse） |
| **工具并发** | 路径分析 + 安全集合 | StreamingToolExecutor + siblingAbort |
| **插件** | 运行时注册 + 钩子 | 三层模型 + 市场 |
| **MCP** | 客户端（连接外部服务器） | 服务端（对外暴露工具） |

---

## 23. 源码阅读建议

1. **快速入门**：run_agent.py 第 875-1400 行（AIAgent.__init__）+ 10478 行起（run_conversation）
2. **工具系统**：tools/registry.py（注册机制）→ model_tools.py（编排层）
3. **CLI 体验**：cli.py 第 1986 行起（HermesCLI）→ hermes_cli/commands.py（斜杠命令）
4. **网关**：gateway/run.py 第 1-200 行（架构）→ platforms/telegram.py（具体适配器）
5. **TUI**：ui-tui/src/app.tsx → tui_gateway/server.py（JSON-RPC）
6. **压缩**：agent/context_compressor.py（完整实现）
7. **适配器**：agent/anthropic_adapter.py / codex_responses_adapter.py / bedrock_adapter.py
