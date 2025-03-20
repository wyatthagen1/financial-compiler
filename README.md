# Financial Compiler

A sophisticated financial document analysis system that processes and analyzes financial statements using LangChain and AI. The system can extract and format specific financial reports from documents like 10-Q filings.

## Features

- Document processing and analysis using LangChain
- Interactive web interface for document selection
- Support for multiple report types:
  - Balance Sheet
  - Income Statement
  - Statement of Cashflows
- Real-time document analysis and formatting
- Clean, modern UI with responsive design

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: EJS Templates with modern CSS
- **Language**: TypeScript
- **AI/ML**: LangChain with OpenAI
- **Database**: Pinecone for vector storage
- **Storage**: Google Cloud Storage for document storage

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key
- Google Cloud credentials
- Pinecone API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/wyatthagen1/financial-compiler.git
cd financial-compiler
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with the following variables:
```env
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
GOOGLE_CLOUD_PROJECT_ID=your_project_id
```

4. Add your Google Cloud credentials:
Place your `gcs-credentials.json` file in the root directory.

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Build for production:
```bash
npm run build
```

3. Start the production server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Project Structure

```
financial-compiler/
├── src/
│   ├── controllers/     # Route controllers
│   ├── models/         # Data models
│   ├── public/         # Static files
│   ├── runnables/      # LangChain runnables
│   ├── utils/          # Utility functions
│   ├── views/          # EJS templates
│   └── index.ts        # Application entry point
├── dist/               # Compiled JavaScript
├── .env               # Environment variables
├── package.json       # Project dependencies
└── tsconfig.json      # TypeScript configuration
```

## Development

- `npm run dev`: Start development server with hot reload
- `npm run build`: Build TypeScript files
- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier
- `npm test`: Run tests

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License. 