/**
 * Test AI Provider Integration
 * Run this to test the provider architecture
 */

import { AIProviderFactory } from './functions/lib/ai-providers/index.js';

// Mock environment with fake API keys
const mockEnv = {
  OPENAI_API_KEY: 'test-key',
  GEMINI_API_KEY: 'test-key',
  ANTHROPIC_API_KEY: 'test-key',
  MISTRAL_API_KEY: 'test-key'
};

async function testProviders() {
  console.log('🧪 Testing AI Provider Architecture...\n');
  
  const factory = new AIProviderFactory(mockEnv);
  
  // Test 1: Get available providers
  console.log('1️⃣ Testing getAvailableProviders()');
  const available = factory.getAvailableProviders();
  console.log('   Available providers:', available);
  console.log('   ✅ Expected 4 providers:', available.length === 4 ? 'PASS' : 'FAIL');
  console.log('');
  
  // Test 2: Get providers info
  console.log('2️⃣ Testing getProvidersInfo()');
  const providersInfo = factory.getProvidersInfo();
  console.log('   Providers info:');
  providersInfo.forEach(p => {
    console.log(`   - ${p.name}: ${p.model}`);
    console.log(`     Capabilities: ${p.capabilities.join(', ')}`);
    console.log(`     Languages: ${p.supportsLanguages.join(', ')}`);
  });
  console.log('');
  
  // Test 3: Get specific provider
  console.log('3️⃣ Testing getProvider(openai)');
  try {
    const openai = factory.getProvider('openai');
    const info = openai.getInfo();
    console.log('   Provider info:', info);
    console.log('   ✅ Provider loaded successfully');
  } catch (error) {
    console.log('   ❌ Error:', error.message);
  }
  console.log('');
  
  // Test 4: Get random provider
  console.log('4️⃣ Testing getRandomProvider()');
  const random1 = factory.getRandomProvider();
  const random2 = factory.getRandomProvider();
  const random3 = factory.getRandomProvider();
  console.log('   Random selections:', [random1.name, random2.name, random3.name]);
  console.log('   ✅ Random provider selection working');
  console.log('');
  
  // Test 5: Get validation providers
  console.log('5️⃣ Testing getValidationProviders(openai)');
  const validators = factory.getValidationProviders('openai');
  console.log('   Validation providers (excluding openai):', validators.map(p => p.name));
  console.log('   ✅ Expected 3 providers:', validators.length === 3 ? 'PASS' : 'FAIL');
  console.log('');
  
  // Test 6: Test prompt building
  console.log('6️⃣ Testing prompt generation');
  const openai = factory.getProvider('openai');
  const prompt = openai.buildPrompt('Historia', 'youth', 'medium', 'global', 5, 'sv');
  console.log('   Prompt length:', prompt.length, 'characters');
  console.log('   Contains "bilingual":', prompt.includes('svenska OCH engelska') ? '✅ YES' : '❌ NO');
  console.log('   Contains "targetAudience":', prompt.includes('targetAudience') ? '✅ YES' : '❌ NO');
  console.log('');
  
  console.log('✅ All provider architecture tests complete!');
}

// Run tests
testProviders().catch(console.error);
