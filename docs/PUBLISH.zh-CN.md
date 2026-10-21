# 将 ArmPath Lite 发布到自己的 GitHub

这个项目已经带有 README、MIT LICENSE、示例、测试与自动测试配置。仓库名建议使用 `armpath-lite`；署名为 **ArmPath Lite contributors**。

项目已发布至 [fcship625/armpath-lite](https://github.com/fcship625/armpath-lite)。以下步骤可用于后续迁移，或在其他账户下自行发布；GitHub Pages 为可选的单独部署步骤。

## 方法一：通过网页上传

1. 登录 GitHub，点击右上角 **+ → New repository**。
2. Repository name 填 `armpath-lite`，可见性选 **Public**。
3. 描述可填：`A lightweight 2R robot arm path checker with continuous reachability checks and CSV export.`
4. 不勾选初始化 README、.gitignore 或 license，因为项目里已经包含这些文件。
5. 创建仓库，选择 **uploading an existing file**，上传解压后 `armpath-lite` **文件夹内部的文件与子目录**，再提交。
6. 确认仓库根目录能直接看到 `index.html`、`README.md` 和 `LICENSE`，不要再套一层 `armpath-lite` 目录，也不要只上传 ZIP。
7. 若系统没有上传隐藏的 `.github` 目录，可在 GitHub 选择 **Add file → Create new file**，文件名填 `.github/workflows/test.yml`，将本地同名文件内容粘贴进去并提交。`.gitignore` 同理。

也可以先新建空仓库，再通过 GitHub Desktop 添加本地项目并推送；它能保留点号开头的文件。

## 方法二：通过 Git 推送

在项目文件夹中打开终端。先将下方 `YOUR_USERNAME` 替换为你的真实 GitHub 用户名，并在 GitHub 创建同名的空公开仓库：

```sh
git init -b main
git add .
git commit -m "Initial release: ArmPath Lite"
git remote add origin https://github.com/YOUR_USERNAME/armpath-lite.git
git push -u origin main
```

如果 Git 提示需要配置作者，使用你希望公开显示的名字，以及 GitHub 提供的 noreply 邮箱，在**此仓库内**设置 `user.name` 和 `user.email`，再重新提交。登录由 GitHub 或 Git 凭据管理器处理，不要把密码或访问令牌写入源码。

## 开启在线演示

1. 仓库顶部点击 **Settings → Pages**。
2. 在 **Build and deployment** 中选择 **Deploy from a branch**。
3. Branch 选 **main**，目录选 **/(root)**，保存。
4. 等待部署完成后，使用 Pages 页面给出的 **Visit site** 链接。通常项目地址形如 `https://YOUR_USERNAME.github.io/armpath-lite/`，实际以 GitHub 显示为准。
5. 在仓库 **About** 中把演示地址填入 Website。

项目已包含 `.nojekyll`，不需要安装构建工具。首次发布后，在桌面和手机浏览器手动确认拖动目标、盲区反例、回放和文件导出正常。

## 可直接使用的仓库资料

**Topics：** `robotics` `inverse-kinematics` `robot-arm` `motion-planning` `javascript` `educational` `2d`

**首次发布版本：** `v1.0.0`

**Release 说明：**

```text
ArmPath Lite v1.0.0

A dependency-free browser tool for exploring planar 2R robot arm paths.

- Both analytic IK branches and interactive workspace visualization
- Continuous straight-segment reachability checks, including inner blind zones
- Singularity indicators, sampled playback, and CSV trajectory export
- JSON project import/export and built-in examples
- Chinese UI, tests, and MIT license

Educational geometry model; hardware constraints and dynamics are not included.
```

## MIT 许可证如何生效？

MIT 是你选择随项目提供的开源许可，不是 GitHub 颁发的认证，也不是原创性证明。保留仓库根目录的标准 `LICENSE` 文件，并在 README 中说明许可，GitHub 通常可以识别它。以后引入外部代码或素材时，还需要核实其许可要求。

官方参考：[创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)、[创建 GitHub Pages 站点](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)、[仓库许可说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。
