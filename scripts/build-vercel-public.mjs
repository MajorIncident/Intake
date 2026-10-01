#!/usr/bin/env node
/**
 * @fileoverview Builds the minimal public static bundle used by Vercel.
 *
 * The repository contains internal documentation, tests, authoring data, and
 * build tooling that must not become public static assets. This script copies
 * only the browser runtime into dist/ and verifies the resulting boundary.
 */

import { promises as fs } from 'node:fs';

import { PROTECTED_CASE_STUDY_MANIFEST } from '../api/protected-case-studies.manifest.js';

const root = new URL('../', import.meta.url);
const output = new URL('../dist/', import.meta.url);

const ROOT_RUNTIME_FILES = Object.freeze([
  'index.html',
  'main.js',
  'styles.css'
]);

const RUNTIME_DIRECTORIES = Object.freeze([
  'components',
  'src'
]);

async function copyFile(relativePath) {
  const source = new URL(relativePath, root);
  const destination = new URL(relativePath, output);
  await fs.mkdir(new URL('./', destination), { recursive: true });
  await fs.copyFile(source, destination);
}

async function copyJavaScriptTree(directoryName) {
  const sourceDirectory = new URL(`../${directoryName}/`, import.meta.url);
  const destinationDirectory = new URL(`../dist/${directoryName}/`, import.meta.url);
  await fs.mkdir(destinationDirectory, { recursive: true });

  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      throw new Error(
        `Unexpected nested directory in public runtime tree ${directoryName}/${entry.name}; update build-vercel-public.mjs explicitly.`
      );
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    await fs.copyFile(
      new URL(entry.name, sourceDirectory),
      new URL(entry.name, destinationDirectory)
    );
  }
}

async function collectOutputFiles(directoryUrl, prefix = '') {
  const files = [];
  const entries = await fs.readdir(directoryUrl, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directoryUrl);
    if (entry.isDirectory()) {
      files.push(...await collectOutputFiles(child, relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

async function verifyOutput() {
  const files = (await collectOutputFiles(output)).sort();

  for (const file of files) {
    if (!(
      ROOT_RUNTIME_FILES.includes(file)
      || file.startsWith('src/')
      || file.startsWith('components/')
    )) {
      throw new Error(`Unexpected public deployment file: ${file}`);
    }

    if (
      file.endsWith('.md')
      || file.endsWith('.json')
      || file.endsWith('.mjs')
      || file.includes('AGENTS')
    ) {
      throw new Error(`Internal repository file leaked into public deployment output: ${file}`);
    }
  }

  for (const required of ROOT_RUNTIME_FILES) {
    if (!files.includes(required)) {
      throw new Error(`Required browser runtime file missing from public deployment output: ${required}`);
    }
  }

  const textFiles = await Promise.all(files.map(async file => ({
    file,
    content: await fs.readFile(new URL(file, output), 'utf8')
  })));

  for (const caseStudy of PROTECTED_CASE_STUDY_MANIFEST) {
    for (const protectedText of [caseStudy.id, caseStudy.name]) {
      const leaked = textFiles.find(item => item.content.includes(protectedText));
      if (leaked) {
        throw new Error(
          `Protected Case Study text leaked into public deployment output ${leaked.file}: ${protectedText}`
        );
      }
    }
  }

  console.log(
    `[build:vercel-public] Built ${files.length} public file(s) in dist/ with no internal docs or protected Case Study identifiers.`
  );
}

async function main() {
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });

  for (const file of ROOT_RUNTIME_FILES) {
    await copyFile(file);
  }
  for (const directory of RUNTIME_DIRECTORIES) {
    await copyJavaScriptTree(directory);
  }

  await verifyOutput();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
