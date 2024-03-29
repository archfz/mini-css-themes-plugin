const {exec} = require('child_process');
const {expect} = require('chai');
const fs = require('fs');
const path = require('path');

const runBuild = async (testType, callback) => {
  await new Promise(resolve => {
    exec(`_TEST_TYPE=${testType} npm run build`, (error, stdout, stderr) => {
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
  const assertBuildFiles = (specDir) => {
    const specFiles = fs.readdirSync(specDir);
    specFiles.forEach((specFile) => {
      const specFilePath = path.join(__dirname, specDir, specFile);
      const actualFilePath = path.join(__dirname, './dist', specFile);

      expect(fs.existsSync(actualFilePath)).to.be.true;
      expect(fs.readFileSync(actualFilePath).toString().replace(/\n$/, ''))
        .to.eq(fs.readFileSync(specFilePath).toString().replace(/\n$/, ''));
    });
  };

  it('Should compile single entry themes correctly.', async () => {
    await runBuild('', () => {
      assertBuildFiles('./dist-spec-single-entries');
    });
  }).timeout(60000);

  it('Should compile multi entry themes with composes switches correctly.', async () => {
    await runBuild('multi-entries', () => {
      assertBuildFiles('./dist-spec-multi-entries');
    });
  }).timeout(60000);
});
