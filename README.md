
# Mir UI

Mir UI is a desktop application that allows you to securely download, configure and use various clients and tools in the MIR ecosystem. 


## Development

This repo is the hosting application for [Grid UI](https://github.com/MIRChain/mir-grid-ui).

### Quick Start

Install and run Grid UI:

```
git clone https://github.com/MIRChain/mir-grid-ui.git
cd mir-grid-ui
yarn && yarn start
```

Install and run Grid:

```
git clone https://github.com/MIRChain/mir-grid.git
cd mir-grid
yarn && yarn start:dev
```

### Dev Mode

`yarn start:dev`

The developer mode will try to load grid UI from a locally running web server on port `3080`.

#### Debugging

Enable debug logging to console with `DEBUG=geth-js yarn start:dev`.

More namespaces will be added over time and listed here. We would appreciate contributions in adding more throughout our modules.

### Production Mode

`yarn start:prod`

In production mode, a bundled app can be loaded from either `fs` or a remote location such as Mir UI's GitHub releases.


### Build distribution

https://www.electron.build/multi-platform-build#linux

1. Run docker container:

```sh
docker run --rm -ti \
 --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
 --env ELECTRON_CACHE="/root/.cache/electron" \
 --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
 -v ${PWD}:/project \
 -v ${PWD##*/}-node-modules:/project/node_modules \
 -v ~/.cache/electron:/root/.cache/electron \
 -v ~/.cache/electron-builder:/root/.cache/electron-builder \
 electronuserland/builder:wine-05.18
```

2. Type in `yarn && yarn dist`