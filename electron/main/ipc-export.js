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
  let inSpeech = false   // true after a Character cue; cleared by blank lines or structural elements
  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) {
      inSpeech = false   // blank line ends the speech block
      return
    }

    let type = 'Action'
    if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)) {
      type = 'Scene Heading'
      inSpeech = false
    } else if (/^(FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:)/.test(trimmed)) {
      type = 'Transition'
      inSpeech = false
    } else if (/^[A-Z][A-Z\s\(\)\.0-9\-]+$/.test(trimmed) && trimmed.length < 40 && !inSpeech) {
      // All-caps line that isn't inside a speech block = character cue
      type = 'Character'
      inSpeech = true
    } else if (/^\(/.test(trimmed) && inSpeech) {
      type = 'Parenthetical'
      // inSpeech stays true — parenthetical doesn't end the speech block
    } else if (inSpeech) {
      type = 'Dialogue'
      // inSpeech stays true — multi-line dialogue is valid
    }

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

  let inSpeech = false   // true after a Character cue; cleared by blank line or structural element

  for (const line of lines) {
    if (y < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      y = pageHeight - marginTop
    }

    if (!line.trim()) {
      inSpeech = false   // blank line ends the speech block
      y -= lineHeight * 0.5
      continue
    }

    const trimmed = line.trim()
    let x = marginLeft
    let usedFont = font
    let usedSize = fontSize

    if (/^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)) {
      usedFont = boldFont
      inSpeech = false
    } else if (/^(FADE|CUT|SMASH|DISSOLVE)/.test(trimmed)) {
      // Transitions: left margin (right-aligning precisely requires measuring full line width)
      inSpeech = false
    } else if (/^[A-Z][A-Z\s\(\)\.0-9\-]+$/.test(trimmed) && trimmed.length < 40 && !inSpeech) {
      // All-caps line not inside a speech block = character cue; roughly centered
      x = pageWidth / 2 - (trimmed.length * fontSize * 0.3)
      inSpeech = true
    } else if (/^\(/.test(trimmed) && inSpeech) {
      x = marginLeft + 72   // parenthetical indent (inSpeech stays true)
    } else if (inSpeech) {
      x = marginLeft + 72   // dialogue indent
      // inSpeech stays true — multi-line dialogue is valid
    }
    // else: action — x stays at marginLeft

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

  let inSpeech = false   // true after a Character cue; cleared by blank line or structural element

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      inSpeech = false   // blank line ends the speech block
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }))
      continue
    }

    const isSceneHeading = /^(INT\.|EXT\.|INT\/EXT\.)/.test(trimmed)
    const isTransition = /^(FADE|CUT|SMASH|DISSOLVE)/.test(trimmed)
    // Character: all-caps line not currently inside a speech block
    const isCharacter = !inSpeech && /^[A-Z][A-Z\s\(\)\.0-9\-]+$/.test(trimmed) && trimmed.length < 40
    const isParenthetical = inSpeech && /^\(/.test(trimmed)
    const isDialogue = inSpeech && !isParenthetical

    // Update speech state
    if (isSceneHeading || isTransition) inSpeech = false
    else if (isCharacter) inSpeech = true
    // parenthetical and dialogue lines leave inSpeech true

    // Alignment
    let alignment = AlignmentType.LEFT
    if (isCharacter) alignment = AlignmentType.CENTER
    if (isTransition) alignment = AlignmentType.RIGHT

    // Indentation (in twentieths of a point; 1440 = 1 inch)
    let indent = {}
    if (isParenthetical) indent = { left: 1440, right: 2160 }
    else if (isDialogue) indent = { left: 1440, right: 1440 }

    paragraphs.push(new Paragraph({
      children: [new TextRun({
        text: trimmed,
        bold: isSceneHeading,
        size: 24,
        font: 'Courier New'
      })],
      alignment,
      indent
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
      // Extract text from FDX XML and decode entities encoded by the exporter
      const textMatches = raw.match(/<Text>(.*?)<\/Text>/g) || []
      content = textMatches.map(m => m
        .replace(/<\/?Text>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
      ).join('\n')
    } else {
      throw new Error(`Unsupported import format: ${ext}`)
    }

    return { success: true, content, title }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

module.exports = { handleExport, handleImport }