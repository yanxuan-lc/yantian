# 衍天 `@yanxuan.lc/yantian`

瑶光的第三方命理扩展，提供排盘、推演工具，以及在对话中直接显示的命盘组件：

| 工具 | 作用 |
| --- | --- |
| `bazi_natal` | 八字排盘：四柱、藏干、十神、神煞、四宫、旺衰与喜用神；本命盘与 1–100 岁流盘两个视图 |
| `bazi_flow` | 时段流盘：列出一段时间内每个时辰的流年、流月、流日、流时 |
| `bazi_compat` | 八字合盘（双人）：配偶宫、生肖、五行与用神互补、夫妻星、姻缘神煞，附总评 |
| `qimen_cast` | 时家奇门（拆补法）：九宫四盘，以及求财、求官、谋事、出行、婚姻、疾病、诉讼、谒贵、考试九类断局 |
| `astro_chart` | 西洋占星：整宫制七政盘、相位、福点、行星时 |
| `astro_synastry` | 星盘合盘（双人）：比较盘与组合中点盘 |
| `timing_scan` | 择时：黄历、八字、奇门、星盘四家打分，大凶排除后按名次合并，标出共识时刻 |

计算口径：八字与奇门使用 `lunar-typescript` 历法，星盘使用 `astronomy-engine` 星历（与 Swiss Ephemeris 相差约十角秒）。各盘均与原 Python 实现逐项对照测试；对传统排法的修正记录在 `scripts/golden_qimen.py`。

## 开发

在仓库根目录执行：

```sh
make deps    # 安装依赖
make check   # 格式、类型、测试与构建
make pack    # 打包到 dist-pack/
```

本地安装：`yaoguang plugin install ./dist-pack/yanxuan.lc-yantian-<版本>.tgz`。

在瑶光正式发布新版本之前，插件契约链接到 `../../yaoguang` 的源码（即与 `yaoguang-extensions` 同级的瑶光仓库）。

星盘符号的字形取自 Noto Sans Symbols（SIL OFL 1.1），许可见 `THIRD_PARTY_NOTICES.md`。
