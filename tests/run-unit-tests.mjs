#!/usr/bin/env node
/**
 * Executa cada arquivo de teste em um processo separado, com timeout por arquivo.
 *
 * Motivo: `tsx --test <vários arquivos>` não encerra o processo neste ambiente
 * (Windows + Node 24), mesmo com todos os testes passando — o runner fica preso
 * gerenciando os processos filhos. Rodando arquivo por arquivo, com captura de
 * saída e timeout, o término é determinístico e a saída continua legível.
 *
 * Uso: node tests/run-unit-tests.mjs
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const TESTS_TIMEOUT_MS = Number(process.env.TESTS_TIMEOUT_MS ?? 60_000);

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const unitDir = path.join(testsDir, 'unit');

const files = readdirSync(unitDir)
  .filter((file) => file.endsWith('.test.ts'))
  .sort()
  .map((file) => path.join(unitDir, file));

if (files.length === 0) {
  console.error(`Nenhum arquivo *.test.ts encontrado em ${unitDir}`);
  process.exit(1);
}

const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');
const failures = [];

for (const file of files) {
  const label = path.relative(process.cwd(), file);
  console.log(`\n▶ ${label}`);

  // No Windows o shim é um .cmd (exige shell); passamos o comando como string única
  // para não disparar o aviso de depreciação do Node sobre args com shell: true.
  const result = isWindows
    ? spawnSync(`"${tsxBin}" --test "${file}"`, { encoding: 'utf8', timeout: TESTS_TIMEOUT_MS, shell: true })
    : spawnSync(tsxBin, ['--test', file], { encoding: 'utf8', timeout: TESTS_TIMEOUT_MS });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    const reason = result.error.code === 'ETIMEDOUT' ? `timeout de ${TESTS_TIMEOUT_MS}ms` : result.error.message;
    console.error(`❌ ${label}: ${reason}`);
    failures.push(label);
  } else if (result.status !== 0) {
    failures.push(label);
  }
}

const passed = files.length - failures.length;
console.log(`\n${failures.length === 0 ? '✅' : '❌'} ${passed}/${files.length} arquivos de teste passaram`);
if (failures.length > 0) {
  console.error(`Falhas: ${failures.join(', ')}`);
  process.exit(1);
}
