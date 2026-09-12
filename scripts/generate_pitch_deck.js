import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generatePitchDeckAssets() {
  console.log('🚀 Launching Puppeteer for Interactive PDF & PNG Screenshots generation...');
  
  const templatePath = path.join(__dirname, '..', 'templates', 'pitch_deck_template.html');
  const pdfOutputPath = path.join(__dirname, '..', 'pitch_deck_mitraku_ai.pdf');
  const pdfArtifactPath = 'C:\\Users\\ACER\\.gemini\\antigravity-ide\\brain\\2bfe9f82-15a8-40fb-822a-125920e38e99\\pitch_deck_mitraku_ai.pdf';
  const screenshotsDir = path.join(__dirname, '..', 'public', 'screenshots');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found at: ${templatePath}`);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']
  });

  try {
    const page = await browser.newPage();
    
    // Set 16:9 Landscape viewport HD
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2
    });

    const fileUrl = `file://${path.resolve(templatePath)}`;
    console.log(`📄 Loading HTML Template: ${fileUrl}`);

    await page.goto(fileUrl, {
      waitUntil: ['networkidle0', 'domcontentloaded']
    });

    // Wait 1 second for rendering stabilization
    await new Promise(r => setTimeout(r, 1000));

    console.log('🖨️ Rendering PDF slides (1920x1080 resolution)...');
    const pdfBuffer = await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    fs.writeFileSync(pdfOutputPath, pdfBuffer);
    console.log(`✅ Pitch Deck PDF saved to workspace root: ${pdfOutputPath}`);

    try {
      fs.writeFileSync(pdfArtifactPath, pdfBuffer);
      console.log(`✅ Pitch Deck PDF synced to artifacts directory: ${pdfArtifactPath}`);
    } catch (err) {
      console.warn(`⚠️ Warning syncing to artifact path: ${err.message}`);
    }

    // Capture individual PNG screenshots for hackathon submission requirement!
    const slideElements = await page.$$('.slide');
    console.log(`📸 Capturing ${slideElements.length} PNG Screenshots for Submission...`);

    const hackathonFileNames = [
      '01-user-interface.png',
      '02-problem-statement.png',
      '03-mitraku-ai-solution.png',
      '04-toko-pintar-and-market-research.png',
      '05-brand-kit-and-copywriting-factory.png',
      '06-system-architecture.png',
      '07-langflow-workflow.png',
      '08-bob-integration.png',
      '09-langflow-bob-synergy.png',
      '10-impact-and-metrics.png',
      '11-roadmap-and-scalability.png',
      '12-output-closing.png'
    ];

    for (let i = 0; i < slideElements.length; i++) {
      const fileName = hackathonFileNames[i] || `slide-${String(i + 1).padStart(2, '0')}.png`;
      const screenshotPath = path.join(screenshotsDir, fileName);
      await slideElements[i].screenshot({
        path: screenshotPath,
        type: 'png'
      });
      console.log(`  📸 Saved screenshot [${i + 1}/${slideElements.length}]: public/screenshots/${fileName}`);
    }

  } finally {
    await browser.close();
  }
}

generatePitchDeckAssets().catch((err) => {
  console.error('❌ Failed to generate Pitch Deck PDF & PNGs:', err);
  process.exit(1);
});
