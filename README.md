Meshery is a tool that generates base course meshes from an SVG file and raw height map.

<img src="images/Meshery.iconset/icon_128x128@2x.png" width="128" height="128" />


Head over to our [Meshery guide](https://help.opengolfsim.com/tools/course-building/course-meshes/) in our help docs to learn more.



Logs:

- MacOS: `~/Library/Logs/ogs-meshery/main.log`
- Windows: `%USERPROFILE%/AppData/Roaming/ogs-meshery/main.log`



## Development

You can checkout this repo and run the project locally.

```bash
git checkout https://github.com/OpenGolfSim/course-meshery-tool.git

cd course-meshery-tool

npm install

npm start
```


To tag a new release, make sure you are on the main branch and run the following

```bash
npm version patch
# or
npm version minor
# or
npm version major

# then push main
git push origin main
# then push and the version tag
git push origin vx.x.x
```