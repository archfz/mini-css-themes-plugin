const {exec} = require('child_process');
const {expect} = require('chai');
const fs = require('fs');
const path = require('path');

const runBuild = async (callback) => {
  await new Promise(resolve => {
    exec('npm run build', (error, stdout, stderr) => {
      if (stderr) {
        console.error(stderr);
      }

      // Normalize line endings for unix.
      const normalizedStdout = stdout.replace(/\r\n/g, "\n");
      callback(error, normalizedStdout , stderr);
      expect(normalizedStdout).to.not.contain("Compilation failed.");

      resolve();
    });
  });
};

describe('mini-css-themes-plugin', () => {

  it('Should compile themes correctly.', async () => {
    await runBuild((error, stdout, stderr) => {
      const specFiles = fs.readdirSync('./dist-spec');
      specFiles.forEach((specFile) => {
        const specFilePath = path.join(__dirname, './dist-spec', specFile);
        const actualFilePath = path.join(__dirname, './dist', specFile);

        expect(fs.existsSync(actualFilePath)).to.be.true;
        expect(fs.readFileSync(actualFilePath).toString()).to.eq(fs.readFileSync(specFilePath).toString());
      });
    });
  }).timeout(60000);

});
