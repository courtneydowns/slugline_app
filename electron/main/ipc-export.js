const path = require('path')
const fs = require('fs')
const { dialog } = require('electron')
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib')
const db = require('./db')

// ─── Fountain export ──────────────────────────────────────────────────────────

function toFountain(project, document) {
  const header = `Title: ${project.title}\nCredit: Written by\nAuthor: \nDraft date: ${new Date().toLocaleDateString()}\n\n`
  return header + (document.content || '')
}

// ─── Markdown export ──────────────────────────────────────────────────────────

function toMarkdown(project, document) {
  return `# ${project.title}\n\n*${project.logline || ''}*\n\n---\n\n${(document.content || '').split('\n').map(line => line.trim() ? line : '').join('\n')}`
}

// ─── FDX (Final Draft XML) export ─────────────────────────────────────────────

function toFdx(project, document) {
  const content = document.content || ''
  const lines = content.split('\n')

  let paragraphs = ''
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    let type = 'Action'
    if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)) type = 'Scene Heading'
    else if (/^[A-Z][A-Z\s\(\)\.]+$/.test(trimmed) && trimmed.length < 40) type = 'Character'
    else if (/^\(/.test(trimmed)) type = 'Parenthetical'
    else if (/^(FADE IN:|FADE OUT\.|CUT TO:)/.test(trimmed)) type = 'Transition'

    paragraphs += `  <Paragraph Type="${type}"><Text>${trimmed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Text></Paragraph>\n`
  })

  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
${paragraphs}  </Content>
  <TitlePage>
    <Content>
      <Paragraph Type="Title"><Text>${project.title}</Text></Paragraph>
    </Content>
  </TitlePage>
</FinalDraft>`
}

// ─── PDF export ───────────────────────────────────────────────────────────────

async function toPdf(project, document) {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Courier)
  const boldFont = await pdfDoc.embedFont(StandardFonts.CourierBold)

  const fontSize = 12
  const lineHeight = fontSize * 1.2
  const marginLeft = 72  // 1 inch
  const marginRight = 72
  const marginTop = 72
  const marginBottom = 72
  const pageWidth = 612  // Letter
  const pageHeight = 792

  const content = document.content || ''
  const lines = content.split('\n')

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - marginTop
  const maxWidth = pageWidth - marginLeft - marginRight

  // Title page
  page.drawText(project.title, {
    x: pageWidth / 2 - (project.title.length * fontSize * 0.3),
    y: pageHeight / 2,
    size: 18,
    font: boldFont,
    color: rgb(0, 0, 0)
  })

  if (project.logline) {
    const loglineLines = wrapText(project.logline, font, 11, maxWidth - 72)
    let logY = pageHeight / 2 - 40
    loglineLines.forEach(l => {
      page.drawText(l, { x: marginLeft + 36, y: logY, size: 11, font, color: rgb(0.3, 0.3, 0.3) })
      logY -= lineHeight
    })
  }

  // Script pages
  page = pdfDoc.addPage([pageWidth, pageHeight])
  y = pageHeight - marginTop

  for (const line of lines) {
    if (y < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      y = pageHeight - marginTop
    }

    if (!line.trim()) {
      y -= lineHeight * 0.5
      continue
    }

    const trimmed = line.trim()
    let x = marginLeft
    let usedFont = font
    let usedSize = fontSize

    if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)) {
      usedFont = boldFont
    } else if (/^[A-Z][A-Z\s\(\)\.]+$/.test(trimmed) && trimmed.length < 40) {
      x = pageWidth / 2 - (trimmed.length * fontSize * 0.3)
    } else if (/^\(/.test(trimmed)) {
      x = marginLeft + 72
    } else if (!/^(FADE|CUT|SMASH|DISSOLVE)/.test(trimmed)) {
      x = marginLeft + 72  // indent for dialogue (simple heuristic)
    }

    const wrapped = wrapText(trimmed, usedFont, usedSize, maxWidth - (x - marginLeft))
    wrapped.forEach(wline => {
      if (y < marginBottom) {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        y = pageHeight - marginTop
      }
      page.drawText(wline, { x, y, size: usedSize, font: usedFont, color: rgb(0, 0, 0) })
      y -= lineHeight
    })
    y -= lineHeight * 0.25
  }

  return await pdfDoc.save()
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''

  for (const word of words) {
    const test = current ? current + ' ' + word : word
    const width = font.widthOfTextAtSize(test, size)
    if (width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// ─── DOCX export ──────────────────────────────────────────────────────────────

async function toDocx(project, document) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = require('docx')

  const content = document.content || ''
  const lines = content.split('\n')
  const paragraphs = []

  // Title
  paragraphs.push(new Paragraph({
    children: [new TextRun({ text: project.title, bold: true, size: 36, font: 'Courier New' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }))

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }))
      continue
    }

    const isSceneHeading = /^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)
    const isCharacter = /^[A-Z][A-Z\s\(\)\.]+$/.test(trimmed) && trimmed.length < 40
    const isParenthetical = /^\(/.test(trimmed)
    const isTransition = /^(FADE|CUT|SMASH|DISSOLVE)/.test(trimmed)

    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: trimmed,
        bold: isSceneHeading,
        size: 24,
        font: 'Courier New'
      })],
      alignment: isCharacter || isTransition ? AlignmentType.CENTER : AlignmentType.LEFT,
      indent: isParenthetical ? { left: 1440 } : isCharacter ? {} : { left: isCharacter ? 0 : 0 }
    }))
  }

  const doc = new Document({ sections: [{ children: paragraphs }] })
  return await Packer.toBuffer(doc)
}

// ─── Main export handler ──────────────────────────────────────────────────────

async function handleExport(event, { projectId, documentId, format, destination }) {
  try {
    const project = db.getProject(projectId)
    const document = db.getDocument(documentId)

    let content, ext, encoding = 'utf8'

    switch (format) {
      case 'fountain':
        content = toFountain(project, document)
        ext = 'fountain'
        break
      case 'md':
        content = toMarkdown(project, document)
        ext = 'md'
        break
      case 'fdx':
        content = toFdx(project, document)
        ext = 'fdx'
        break
      case 'pdf':
        content = await toPdf(project, document)
        ext = 'pdf'
        encoding = null
        break
      case 'docx':
        content = await toDocx(project, document)
        ext = 'docx'
        encoding = null
        break
      default:
        throw new Error(`Unknown format: ${format}`)
    }

    let savePath = destination
    if (!savePath) {
      const result = await dialog.showSaveDialog({
        defaultPath: path.join(require('os').homedir(), 'Desktop', `${project.title}.${ext}`),
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (result.canceled) return { success: false, canceled: true }
      savePath = result.filePath
    }

    if (encoding) {
      fs.writeFileSync(savePath, content, encoding)
    } else {
      fs.writeFileSync(savePath, content)
    }

    return { success: true, path: savePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function handleImport(event, { filePath }) {
  try {
    const ext = path.extname(filePath).toLowerCase()
    let content = ''
    let title = path.basename(filePath, ext)

    if (ext === '.fountain' || ext === '.txt' || ext === '.md') {
      content = fs.readFileSync(filePath, 'utf8')
    } else if (ext === '.fdx') {
      const raw = fs.readFileSync(filePath, 'utf8')
      // Extract text from FDX XML
      const textMatches = raw.match(/<Text>(.*?)<\/Text>/g) || []
      content = textMatches.map(m => m.replace(/<\/?Text>/g, '')).join('\n')
    } else {
      throw new Error(`Unsupported import format: ${ext}`)
    }

    return { success: true, content, title }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { handleExport, handleImport }
