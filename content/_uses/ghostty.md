---
title: Ghostty
version: v1.0
role: Terminal
status: stable
official_url: https://ghostty.org
summary: 日常终端入口，承担 Git、构建、服务启动和短脚本执行。
---


```ini
# Ghostty 配置
# 位置: ~/Library/Application Support/com.mitchellh.ghostty/config.ghostty

# ========== 字体 ==========
font-family = CaskaydiaMono Nerd Font Mono
font-size = 15
font-thicken = true
font-feature = -liga

# ========== 主题 ==========
theme = Monokai Pro

# ========== 窗口设置 ==========
window-padding-x = 12
window-padding-y = 12
window-decoration = true
background-opacity = 1.0
background-blur = false
window-inherit-working-directory = true

# ========== 光标 ==========
cursor-style = bar
cursor-style-blink = false
cursor-color = #7aa2f7
cursor-text = #1a1b26

# ========== 滚动 ==========
scrollback-limit = 10000000
mouse-scroll-multiplier = 2

# ========== Shell 集成 ==========
shell-integration = detect
shell-integration-features = cursor,sudo,title

# ========== 复制粘贴 ==========
clipboard-read = allow
clipboard-write = allow
clipboard-paste-protection = false
clipboard-trim-trailing-spaces = true
copy-on-select = clipboard

# ========== 输入法 ==========
macos-option-as-alt = true

# ========== 快捷键 ==========
# 新标签
keybind = cmd+t=new_tab
# 关闭标签/窗口
keybind = cmd+w=close_surface
# 全屏
keybind = cmd+shift+enter=toggle_fullscreen
# 快速复制模式
keybind = cmd+shift+c=copy_to_clipboard
keybind = cmd+shift+v=paste_from_clipboard
# 清除屏幕
keybind = cmd+k=clear_screen
# 增大/减小字体
keybind = cmd+plus=increase_font_size:1
keybind = cmd+minus=decrease_font_size:1
keybind = cmd+0=reset_font_size

# 退出时不弹确认框（如果你习惯了 Cmd+Q）
confirm-close-surface = false

```
