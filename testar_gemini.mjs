import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ Defina GEMINI_API_KEY no ficheiro .env');
  process.exit(1);
}

async function listarModelos() {
  console.log('🔍 A verificar modelos disponíveis para a sua chave na Google AI...');
  
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      console.error(`❌ Erro da API Google: HTTP ${res.status}`);
      console.error(JSON.stringify(data, null, 2));
      return;
    }

    const modelos = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    console.log('\n✅ Modelos disponíveis que suportam generateContent:');
    modelos.forEach(m => console.log(` - ${m}`));
    
    if (modelos.length > 0) {
      console.log(`\n👉 Sugestão: utilize o primeiro da lista: "${modelos[0]}"`);
    }
  } catch (err) {
    console.error('❌ Erro na ligação:', err.message);
  }
}

listarModelos();