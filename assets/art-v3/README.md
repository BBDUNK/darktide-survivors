# DarkEscaper V3 美术资源库

本目录保存本轮统一的中世纪复古高精度像素素材。运行时使用 `sprites/` 与 `ui/`，`sources/` 保存 ImageGen 设计母图，便于继续编辑与重新构建。

## 动作规格

- 腐液史莱姆：`slime_actions.png`，8 帧 × 待机、移动、攻击、死亡。
- 精英怪：`elites/elite_<enemy>_actions.png`，每个怪物独立文件，8 帧 × 待机、移动、攻击、死亡；造型内置精英金属与符文特征，不使用头顶标识。
- 商人：`merchant_actions.png`，8 帧 × 待机、射箭、趴地装死。
- 特斯拉电塔：`tesla_tower_actions.png`，8 帧 × 待机、部署、放电、过载。
- 枯木场景：`deadwood_props.png`，四棵大枯树及树桩、倒木、枯根、死芦苇。

## 像素约束

所有运行时 PNG 均使用硬 Alpha、有限调色板与最近邻缩放，不保留半透明抗锯齿边缘。可用以下命令从母图重建，再打包进正式图集：

```powershell
python tools/art/build-art-v3.py
node tools/art/build-atlas.js
python tools/art/validate-sprites.py
```

角色、敌人和交互物继续通过 `SpriteGen.get()` / `SpriteGen.frames()` 访问；图集不可用时保留程序素材兜底。
