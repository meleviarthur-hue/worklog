<div align="center">
  <img src="docs/logo.png" width="140" alt="工时记录" />
  <h1 align="center">工时记录</h1>
  <p align="center">
    <em>为两班倒工人做的工时与薪资计算器</em>
  </p>
  <p align="center">
    <img src="https://img.shields.io/github/v/tag/meleviarthur-hue/worklog?style=flat-square&label=%E7%89%88%E6%9C%AC&color=2ea44f" alt="version" />
    <img src="https://img.shields.io/badge/%E7%B1%BB%E5%9E%8B-PWA-0075ca?style=flat-square" alt="pwa" />
    <img src="https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E9%9B%B6-0075ca?style=flat-square" alt="zero deps" />
    <img src="https://img.shields.io/badge/%E6%95%B0%E6%8D%AE-%E4%BB%85%E6%9C%AC%E5%9C%B0-2ea44f?style=flat-square" alt="local only" />
    <img src="https://img.shields.io/badge/%E8%AE%B8%E5%8F%AF-%E4%BF%9D%E7%95%99%E6%89%80%E6%9C%89%E6%9D%83-6e7681?style=flat-square" alt="license" />
  </p>
  <p align="center">
    <a href="https://meleviarthur-hue.github.io/worklog/"><b>👉 在线使用</b></a>
  </p>
</div>

---

## 这是什么

一个纯本地的工时记录工具，专门为**工厂两班倒（白班 / 夜班）**的场景设计。

算不清工资是件很普遍的事——底薪、加班费、夜班补贴、社保、餐费，到发薪日往往只能被动接受。
这个工具的目的很简单：**让你在发薪日之前，自己就知道该拿多少钱。**

- 界面按下班算工资的逻辑走，不是按考勤打卡的逻辑走
- 白班 / 夜班两套时薪，跨零点自动识别
- 扣款项自己定义，算法自己选
- **数据只存在你手机里**，不上传、不联网、不需要账号

## 主要功能

<table>
<tr>
<td width="50%" valign="top">

**📅 日历首页**

点开就是月历。有记录的日期显示工时数和班次标记：

- `■` 白班　`○` 夜班　`■■` 双班

点任意日期进入当天记录。

</td>
<td width="50%" valign="top">

**⏱ 班次记录**

- 白班 / 夜班分开计时计薪
- 跨零点自动识别（`20:00–08:00` = 12h）
- 支持扣除休息时间
- 单条班次可覆盖默认时薪

</td>
</tr>
<tr>
<td valign="top">

**💰 薪资统计**

- 今天 / 本周 / 本月 / 全部
- 白班工时 · 夜班工时 · 出勤天数
- 薪资构成逐项拆开
- 大字显示**扣款后的实发金额**

</td>
<td valign="top">

**🧾 自定义扣款**

每条扣款项独立设置算法：

| 方式 | 说明 |
|---|---|
| 固定 | 按范围只扣一次，如社保 |
| 按天 | ×出勤天数，如餐费 |
| 按工时 | ×总工时 |
| 按比例 | ×应发薪资 %，如个税 |

</td>
</tr>
</table>

## 快速开始

**在手机上使用（推荐）**

1. iPhone 用 **Safari** 打开 <https://meleviarthur-hue.github.io/worklog/>
2. 点底部 **分享** → **添加到主屏幕**
3. 桌面出现图标，点开即是全屏 App，**断网也能用**

> ⚠️ 必须用 Safari。微信内置浏览器无法添加到主屏幕。

**在电脑上使用**

直接把仓库下载下来，双击 `index.html` 即可。或者用任意静态服务器托管。

## 数据说明

|  |  |
|---|---|
| **存储位置** | 浏览器 localStorage，只在你的设备上 |
| **联网** | 完全不联网，无需账号 |
| **多端同步** | ❌ 不支持，各人记各人的 |
| **换机 / 清数据** | 会丢失，请定期用「设置 → 导出 CSV」备份 |

## 技术细节

```
index.html      界面结构
style.css       样式（GitHub 黑线风 + 深色模式）
app.js          全部逻辑，单文件，无框架无依赖
manifest.json   PWA 配置
sw.js           Service Worker，离线缓存
icons/          应用图标
```

- 零依赖、零构建、零后端
- 原生 HTML / CSS / JS 三件套
- 深色模式跟随系统（`prefers-color-scheme`）
- Service Worker 采用 network-first，保证更新能拿到、离线也能用

## 版本记录

| 版本 | 内容 |
|---|---|
| `v2.0` | 页脚签名 · 赞赏码 · 深色模式 · PWA 图标 |
| `v1.0` | 首版发布：日历首页 · 白夜班两班倒 · 跨零点识别 · 自定义扣款 |

```bash
# 回到任意版本
git checkout v1.0
```

## 关于

一个人做的，给自己和同事用。

如果它帮你算清了工资 → [请我喝杯水](https://meleviarthur-hue.github.io/worklog/)

## 许可

版权所有 © 2026 杨青。**保留所有权利。**

本作品可供个人学习、研究使用；未经作者许可，不得复制、修改、分发或用于商业用途。
详见 [LICENSE](LICENSE)。

<div align="center">
<br>
<sub>made by 杨青 · 用爱发电</sub>
</div>
