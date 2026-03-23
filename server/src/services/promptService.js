import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const promptsDirectory = path.resolve(__dirname, '..', '..', '..', 'prompts');
export const companyPromptPath = path.join(promptsDirectory, 'company.md');
export const companyNamePromptPath = path.join(promptsDirectory, 'company-name.md');
export const companyUrlPromptPath = path.join(promptsDirectory, 'company-url.md');
export const offersDirectory = path.join(promptsDirectory, 'offers');
export const generatedPromptsDirectory = path.join(promptsDirectory, 'generated');

export const normalizePromptContent = (value = '') => value.replace(/\r\n/g, '\n').trim();

export const readPromptFile = async (filePath) => {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return '';
  }
};

export const writePromptFile = async (filePath, content) => {
  const normalizedContent = normalizePromptContent(String(content || ''));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${normalizedContent}\n`, 'utf8');
  return normalizedContent;
};

export const getPromptSettings = async () => {
  const [companyName, companyAbout, companyUrl, offerA, offerB] = await Promise.all([
    readPromptFile(companyNamePromptPath),
    readPromptFile(companyPromptPath),
    readPromptFile(companyUrlPromptPath),
    readPromptFile(path.join(offersDirectory, 'offer_a.md')),
    readPromptFile(path.join(offersDirectory, 'offer_b.md')),
  ]);

  return {
    companyName: normalizePromptContent(companyName),
    companyAbout: normalizePromptContent(companyAbout),
    companyUrl: normalizePromptContent(companyUrl),
    offerA: normalizePromptContent(offerA),
    offerB: normalizePromptContent(offerB),
  };
};

export const updatePromptSettings = async ({ companyName = '', companyAbout = '', companyUrl = '', offerA = '', offerB = '' }) => {
  const [savedCompanyName, savedCompanyAbout, savedCompanyUrl, savedOfferA, savedOfferB] = await Promise.all([
    writePromptFile(companyNamePromptPath, companyName),
    writePromptFile(companyPromptPath, companyAbout),
    writePromptFile(companyUrlPromptPath, companyUrl),
    writePromptFile(path.join(offersDirectory, 'offer_a.md'), offerA),
    writePromptFile(path.join(offersDirectory, 'offer_b.md'), offerB),
  ]);

  return {
    companyName: savedCompanyName,
    companyAbout: savedCompanyAbout,
    companyUrl: savedCompanyUrl,
    offerA: savedOfferA,
    offerB: savedOfferB,
  };
};
