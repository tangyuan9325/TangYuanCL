# 历史 QA 证据目录（已移除）

`docs/validation-1.1.6/`、`docs/validation-1.1.7/`、`docs/validation-1.1.9/` 三个目录已于 1.1.9 维护批次中删除。

## 移除原因

这些目录是早期「每发一版自动跑一轮 QA 并把全轮证据入库」流程的产物，内容包括 65 个文件、
约 6.6 MB 的截图与原始 JSON（`native-white.png`、`default-skin.png` 等）。它们：

- 不被任何源码、脚本或测试引用；
- 不参与构建；
- 只服务于一次性的人工复核，复现价值低于维护成本。

仓库历史上因此累积了约 5870 张截图，`docs/` 一度占 595 MB，直接导致 clone 体积异常。
`.gitignore` 现已忽略 `docs/validation-*/`，后续同类产物不会再入库。

## 保留内容

- `docs/validation/`：4 个纯文本验证记录（curl 输出、启动窗口检查），体积 88 KB，保留作可检索的结论存档。
- `CURRENT_STATUS.md`、`docs/FEATURE_TREE.md` 等文档中的结论不受影响。

## 历史体积如何进一步清理

本次只删除了当前工作树里的残留文件，历史提交中的大文件仍在 `.git` 对象库中。需要维护者执行一次历史重写：

```bash
# 需先安装 git-filter-repo，并确认所有协作者已知晓重写
git filter-repo --path docs/validation-1.1.6 --path docs/validation-1.1.7 \
                --path docs/validation-1.1.9 --invert-paths
git push --force-with-lease origin main
```

重写历史属于发布级操作，必须由维护者人工确认，不得由自动化执行（见 `AGENTS.md` 发布闸门）。
