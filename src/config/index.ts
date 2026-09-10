import dotenv from 'dotenv';

dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  tavilyApiKey: process.env.TAVILY_API_KEY || '',
  githubToken: process.env.GITHUB_TOKEN || '',
};

if (!config.telegramBotToken) {
  console.warn('⚠️ WARNING: TELEGRAM_BOT_TOKEN belum diisi di file .env');
}

if (!config.geminiApiKey) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY belum diisi di file .env');
}

if (!config.tavilyApiKey) {
  console.warn('⚠️ WARNING: TAVILY_API_KEY belum diisi di file .env');
}

if (!config.githubToken) {
  console.warn('⚠️ WARNING: GITHUB_TOKEN belum diisi di file .env');
}
