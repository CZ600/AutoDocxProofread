# AutoDocxProofread - Smart Document Proofreading Assistant

<p align="right">
  <a href="README.md">中文</a>
</p>

<p align="center">
  <img src="src/renderer/assets/logo.png" alt="Logo" width="120" />
</p>

<p align="center">
  A smart desktop application for long document proofreading built with Electron, Vue 3, and TypeScript
</p>

## 📝 Project Introduction

AutoDocxProofread (Smart Proofreading) is a desktop application designed specifically for long document proofreading and thesis format optimization. It helps users effectively detect typos, punctuation errors, grammar issues, and text consistency problems in Word documents, while providing modification suggestions. It also supports text polishing to reduce AI detection rates, and offers cross-document format cloning for one-click full-text formatting.

To address the forgetting and hallucination issues that large models experience when processing long documents, the software is designed with a specialized architecture to enhance proofreading accuracy and can export the proofread and modified documents with one click. The software also employs a parallel processing architecture that significantly improves the speed of processing long documents with large models. Additionally, a local knowledge base feature is introduced, supporting RAG functionality to provide reference material for model proofreading.

For the reduce AI detection rate feature, the software uses segmented parallel operations, dividing documents by natural paragraphs and processing them in parallel with large models.



### Core Advantages

Why use this software?
1. Compared to using Claude Code with skills for document proofreading, reduce AI detection, and format adjustment, this software provides better visualization, allows intuitive inspection of results, is faster, and saves tokens.
2. Compared to using ChatGPT, Doubao, and other web AI applications, this project provides a one-click workflow that is convenient to operate, saves the effort of repeatedly communicating with large models, and is faster.
3. Compared to the built-in proofreading systems in MS Office and WPS, this project is more intelligent and can identify a wider variety of errors.
4. Format adjustment does not require large models, making it faster.

### Usage Demonstration

Users need to first select a large model in the settings page before starting proofreading. On the document proofreading page, first select the document to proofread, then choose the proofreading mode, select a knowledge base (optional), and start proofreading. The software will display the proofreading results in the right sidebar and highlight them in the text for easy viewing. You can then choose whether to accept these modifications and export the document with accepted changes:

![Document Proofreading Page](assets/新首页.png)

The Reduce AI Detection Rate feature adjusts the language style of AI-generated text to lower the probability of being flagged by AI detection tools. During the process, references, titles, etc. are automatically skipped. This feature also uses segmented parallel processing:
![Reduce AI Rate](assets/降低ai率.png)

The Format Clone feature extracts format styles from a reference document and applies them to the target document, with fine-tuning options available during application:
![Format Clone](assets/格式克隆.png)

This application allows custom API settings, compatible with APIs meeting OpenAI specifications. Non-reasoning models are recommended, and you can limit concurrent request count and request rate:

![Settings Interface](assets/设置页面.png)

You can set proofreading error types, strictness level, and text background, or set custom prompts:

![Prompt Settings](assets/提示词设置.png)

This application also allows browsing and managing proofreading history:

![History Interface](assets/历史记录.png)

Dark Mode:
![Dark Mode](assets/深色模式.png)

### ⚠️ Important Notes!
- Note: The accuracy of proofreading results depends largely on the model's capabilities. The software cannot guarantee complete accuracy of proofreading results, and manual verification is still required!
- Note: The reduce AI detection feature is not guaranteed to be effective. Please strictly follow academic ethics and review the results yourself!
- Note: The format migration feature cannot migrate individually set formats within paragraphs; manual adjustment is required.
- Tip: The result export function may have omissions; manual verification is recommended.
- Tip: Based on current large model context memory, top-tier models can directly use full document proofreading for content under 10,000 characters.
- Tip: For both reduce AI detection and proofreading features, it is recommended to set heading levels in Word first for better document segmentation.

### Main Features

- **Multiple Proofreading Modes**:
  - Sentence-by-sentence proofreading: Suitable for short texts requiring high-precision proofreading
  - Paragraph-by-paragraph correction: Suitable for proofreading long documents
  - Full document proofreading: One-time proofreading for the entire document
  - Reduce AI Detection Rate: Adjust language style of AI-generated text to lower the probability of being flagged by AI detection tools

- **Format Clone**:
  - Extract paragraph and text styles from reference documents
  - Batch apply extracted formatting to target documents
  - Fine-tune format details including font, color, spacing, and more

- **Intelligent Error Recognition**:
  - Typo detection
  - Punctuation error recognition
  - Grammar issue detection
  - Table content proofreading: table text is organized row by row for proofreading, with results highlighted and replaceable in tables

- **Knowledge Base System**:
  - Create and manage multiple local knowledge bases
  - Support importing PDF, Word, and txt documents as reference materials
  - RAG (Retrieval-Augmented Generation) algorithm based on vector database
  - Select multiple knowledge bases simultaneously as reference during proofreading

- **Faster Processing Speed and User-Friendly Experience**:
  - Optimized processing efficiency using parallel processing, significantly improving proofreading speed for long texts
  - Clear error display and modification suggestions
  - One-click application of modification suggestions, one-click export of modified documents
  - Adjustable correction parameters to adapt to different task scenarios
  - Recent files list for quickly reopening previously proofread documents

- **Convenient API Configuration Management**:
  - Compatible with OpenAI interfaces, supporting various large language model APIs
  - Flexible API configuration management
  - Support for setting concurrency count and request speed

- **Clear History Management**:
  - Clearly view historical records including time, proofreading model, proofread file path, and specific results
  - Support for batch management of results


## 🎯 Usage Guide

### 1. Configure API

First-time use requires configuring a supported large language model API:

1. Click "Settings"
2. Click the "API" tab
3. Fill in the API address, key, and model name
4. Click "Test Connection" to verify the configuration
5. Click "Save Configuration" to save settings

### 2. Create Knowledge Base

1. Click "Knowledge Base" in the navigation bar
2. Select "Embedding Model" (requires selecting a dedicated embedding model)
3. Click "Add Knowledge Base" button to create a new knowledge base
4. After selecting a knowledge base, you can add PDF files as reference materials

### 3. Document Proofreading

1. Select the "Document Proofreading" tab
2. Click "Select DOCX File" button to choose the Word document to proofread (the dropdown arrow next to the button quickly reopens recently proofread files)
3. (Optional) Check one or more knowledge bases to enhance proofreading accuracy
4. Choose an appropriate proofreading mode:
   - **Sentence-by-sentence Proofreading**: Suitable for short texts requiring high-precision proofreading
   - **Paragraph-by-paragraph Correction**: Suitable for proofreading long documents
   - **Full Document Proofreading**: One-time proofreading for the entire document
5. Click "Start Proofreading" button to begin the proofreading process
6. View proofreading results and modification suggestions in the left sidebar
7. Click "Apply Changes" button to accept suggested modifications (can also undo)
8. Click "Export Result" button to save the modified document

### 4. Correction Parameter Settings

1. Click prompt settings in the "Feature Settings" page to select different correction parameters such as text background, correction strictness, and error types
2. You can also use your own prompts; when using custom prompts, the original prompts will be disabled. It is recommended to modify based on the original prompts, otherwise it may affect the display effect
3. Click "Restore Default Configuration" to reset the above settings

### 5. Reduce AI Detection Rate
1. Select an API provider
2. Click "Reduce AI Detection" in the proofreading mode options
3. Click "Start Proofreading"
4. After results are generated, you can choose to accept or reject them
5. Click "Export Result" to export the results


### 6. Format Clone
1. After opening a file, click the "Format Clone" button to switch to format clone mode
2. Click "Select Reference Document" in the left sidebar to select the reference document
3. Click the "Start Clone" button in the upper right corner to begin cloning
4. The left sidebar shows the extracted format information from the reference document, and you can fine-tune parameters like color, font size, and line spacing
5. Click "Export Result" to export the results

### Changelog

- v1.2.2
  - Added table content proofreading; table text now participates in proofreading row by row (previously skipped)
  - Fixed modification write-back loss for paragraphs containing formulas; improved tolerance of footnote/formula marker restoration
  - Added a recent files list for quickly reopening previously proofread documents
  - Support selecting multiple knowledge bases simultaneously during proofreading
  - Rearranged the API settings page, moved language switching into settings, and added delete confirmation for API entries
  - Fixed the issue where knowledge base engine load failures showed no feedback in the UI: the failure cause and extension path are now reported clearly, with a hint to check antivirus interception of vec0.dll (fixes the user-reported "knowledge base added but not displayed" issue)
  - Fixed the issue where deleting a knowledge base reported "success" even when the deletion failed
  - Fixed a crash in the error message itself when deleting knowledge base files failed
- v1.2.1
  - Reduced installer size
  - Replaced LanceDB with sqlite-vec for a lighter footprint
  - Improved RAG availability
- v1.2.0
  - Reduced installer size
  - Improved the reduce AI detection effect
  - Improved paragraph recognition and document structure / paragraph matching accuracy
  - Improved RAG retrieval quality
- v1.1.9
  - Updated AI format parsing
  - Fixed Claude API availability
  - Fixed Gemini API availability
- v1.1.8
  - Updated the reduce AI detection feature
  - Updated the format migration feature
  - Optimized format extraction functionality
  - Optimized the full-text summarization effect in proofreading
- v1.1.7
  - Refactored pages for better user experience
  - Bilingual support for Chinese and English
  - Added more API support, including simulated Claude Code API requests
- v1.1.6
  - Added progress bar for real-time proofreading status
  - Optimized API settings functionality
  - Optimized prompt settings for clarity and convenience
  - Clicking on proofreading results allows direct navigation
- v1.1.5
  - Optimized user experience for file export functionality
  - Optimized file export logic for more accurate error replacement
- v1.1.4
  - Added proxy functionality
- v1.1.3
  - Added request rate limiting, optimized support for third-party API relays
  - Optimized dark mode display
  - Added token usage statistics
  - Optimized interface effects and interaction logic
- v1.1.2
  - Fixed bug in full-text polishing mode where proofreading wouldn't work without RAG
  - Added day/night mode toggle
  - Adjustable model concurrency limits to accommodate different API providers' requirements
- v1.1.1
  - Fixed RAG functionality availability bug
- v1.1.0
  - Refactored interface and optimized usage logic
  - Improved software usability


## 🛠 Technology Stack

- **Main Framework**: [Electron](https://www.electronjs.org/) + [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **UI Component Library**: [Element Plus](https://element-plus.org/)
- **Build Tools**: [electron-vite](https://electron-vite.org/) + [electron-builder](https://www.electron.build/)
- **Document Processing**: [Mammoth](https://github.com/mwilliamson/mammoth.js) + [Docxtemplater](https://github.com/open-xml-templating/docxtemplater)
- **Vector Search**: [sqlite-vec](https://github.com/asg017/sqlite-vec) extension (local vector storage on top of sqlite3)
- **Code Standards**: [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/)
- **Version Management**: [Standard Version](https://github.com/conventional-changelog/standard-version)

## 🚀 Quick Start

### Requirements

- Node.js >= 16.x
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

```bash
npm run start
```


## 🔧 Development Plan

- [ ] Word document format proofreading
- [ ] Enhance user interface interaction experience (ongoing)
- [x] Optimize .docx file processing algorithm

## 📄 License

This project uses the MIT License - see the [LICENSE](LICENSE) file for details

## 🌺 Acknowledgments

- Some code uses night-peiqi's https://github.com/night-peiqi/electron-vue3-typescript-template
- The reduce AI detection approach uses the solution provided by linuxdo forum user "Chisaki": https://linux.do/t/topic/620470
