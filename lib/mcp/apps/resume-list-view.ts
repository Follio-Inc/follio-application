// MCP APP: THE RESUME LIST (runs in the browser, inside the host's sandboxed iframe, not on our server)
//

// this is the code for the UI that is actually displayed in the popup window.

// claude.ai shows this page when the AI calls list_resumes. Screen 1 is a card for each resume;
// clicking one calls get_resume and shows that resume (screen 2). The page never reads the
// database: it only gets data through tool results, and the host sends those tool calls to
// /api/mcp with the user's Follio connection, so the usual token and owner checks still apply.
//
// `npm run build:mcp-apps` bundles this file (with the ext-apps App class) into
// lib/mcp/apps/dist/resume-list-view.js, and lib/mcp/apps/pages.ts puts it inside the HTML page.

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

// What list_resumes returns (listConnectorResumes in services/ai-connector.service.ts).
interface ResumeItem {
  resumeId: string;
  title: string;
  handle: string;
  headline: string | null;
  visibility: string;
  updatedAt: string;
  isActive: boolean;
}

// What get_resume returns (getConnectorProfile + toConnectorProfileView).
interface Resume {
  resumeId: string;
  title: string;
  name: string;
  headline: string | null;
  summary: string | null;
  location: string | null;
  experiences: {
    id: string;
    company: string;
    role: string;
    location: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    bullets: string[];
  }[];
  education: {
    id: string;
    institution: string;
    degree: string | null;
    fieldOfStudy: string | null;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
  }[];
  skills: string[];
  projects: {
    id: string;
    title: string;
    description: string | null;
    techStack: string[];
    highlights: string[];
  }[];
}

interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
}

const root = document.getElementById('app')!;

// The page's side of the connection to the host (postMessage under the hood).
const app = new App({ name: 'Follio resumes', version: '0.1.0' }, {});

/** Our tools put their result in the first text block (toolResult in lib/mcp/server.ts). */
function textOf(result: ToolResult): string {
  return result.content?.find((block) => block.type === 'text')?.text ?? '';
}

/** Makes one element. Text goes in with textContent (never innerHTML), so data can't inject HTML. */
function el(tag: string, className?: string, text?: string | null): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function showMessage(text: string) {
  root.replaceChildren(el('p', 'muted', text));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2024-03-15" → "Mar 2024". Read from the string, so the user's time zone can't shift it. */
function monthYear(date: string | null): string {
  if (!date) return '';
  const [year, month] = date.split('-');
  return `${MONTHS[Number(month) - 1] ?? ''} ${year}`.trim();
}

function dateRange(start: string | null, end: string | null, isCurrent: boolean): string {
  const from = monthYear(start);
  const to = isCurrent ? 'Present' : monthYear(end);
  return [from, to].filter(Boolean).join(' – ');
}

/** "PUBLIC" → "Public" */
function label(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

// SCREEN 1: one card per resume. `notice` is a line shown above the cards (e.g. after a delete).
function showList(resumes: ResumeItem[], notice?: string) {
  if (resumes.length === 0) {
    showMessage('No resumes yet. Create one in Follio, or ask Claude to create one.');
    return;
  }

  const cards = el('div', 'cards');
  for (const resume of resumes) {
    const card = el('button', 'card');
    card.setAttribute('type', 'button');

    const top = el('div', 'card-top');
    top.append(el('strong', undefined, resume.title));
    if (resume.isActive) top.append(el('span', 'badge', 'In builder'));

    card.append(
      top,
      el('span', 'muted', resume.headline || 'No headline yet'),
      el(
        'span',
        'small muted',
        `${label(resume.visibility)} · Updated ${monthYear(resume.updatedAt.slice(0, 10))}`
      )
    );
    card.addEventListener('click', () => showResume(resume.resumeId, resumes));
    cards.append(card);
  }

  root.replaceChildren(
    el('h1', undefined, 'Your resumes'),
    ...(notice ? [el('p', 'notice', notice)] : []),
    cards
  );
}

/** Reloads the list with list_resumes, e.g. after a resume was deleted. */
async function refreshList(notice?: string) {
  try {
    const result = (await app.callServerTool({
      name: 'list_resumes',
      arguments: {},
    })) as ToolResult;
    if (result.isError) throw new Error(textOf(result));
    const { resumes } = JSON.parse(textOf(result)) as { resumes: ResumeItem[] };
    showList(resumes, notice);
  } catch {
    showMessage(
      `${notice ?? ''} Ask Claude to list your resumes again to see the new list.`.trim()
    );
  }
}

/**
 * Tells the AI what the user did in the page, so it doesn't rely on the old list. The host sends
 * this with the user's next message. Not every host supports it, so a failure is ignored.
 */
async function tellModel(text: string) {
  try {
    await app.updateModelContext({ content: [{ type: 'text', text }] });
  } catch {
    // The host doesn't support model context updates; the delete still happened.
  }
}

// OPEN IN FOLLIO: open_in_builder makes this the resume the builder shows (the builder has no
// per-resume link) and returns the builder link; then the host opens it in a new tab. The iframe
// can't open tabs itself, so app.openLink asks the host (which may ask the user first).
function openButton(resume: Resume, resumes: ResumeItem[]): HTMLElement {
  const button = el('button', 'button', 'Open in Follio ↗');
  button.setAttribute('type', 'button');
  const status = el('p', 'small muted');
  const wrapper = el('div', 'open');
  wrapper.append(button, status);

  button.addEventListener('click', async () => {
    button.setAttribute('disabled', '');
    status.className = 'small muted';
    status.textContent = 'Opening…';
    try {
      const result = (await app.callServerTool({
        name: 'open_in_builder',
        arguments: { resumeId: resume.resumeId },
      })) as ToolResult;
      if (result.isError) throw new Error(textOf(result) || 'Could not open this resume.');
      const { builderUrl } = JSON.parse(textOf(result)) as { builderUrl: string };

      // The builder now shows this resume, so move the "In builder" badge in our list too.
      for (const item of resumes) item.isActive = item.resumeId === resume.resumeId;
      await tellModel(
        `The user opened “${resume.title}” in the Follio builder from the Follio app; it is now the resume open in the builder.`
      );

      const opened = await app.openLink({ url: builderUrl });
      status.textContent = opened.isError
        ? `Couldn't open a new tab. Go to ${builderUrl} — “${resume.title}” is open there.`
        : `Opened “${resume.title}” in the Follio builder.`;
    } catch (failure) {
      status.className = 'error';
      status.textContent = failure instanceof Error ? failure.message : String(failure);
    } finally {
      button.removeAttribute('disabled');
    }
  });
  return wrapper;
}

// DELETE: the button shows a confirm box inside the page (the iframe may block window.confirm).
// Clicking "Delete" there is the user's own confirmation, so the page passes the resume's real
// title as confirmTitle. delete_resumes still does every server check (owner, permission, keep one).
function deleteButton(resume: Resume): HTMLElement {
  const wrapper = el('div', 'danger-zone');
  const start = el('button', 'button danger', 'Delete resume');
  start.setAttribute('type', 'button');
  start.addEventListener('click', () =>
    wrapper.replaceChildren(confirmBox(resume, wrapper, start))
  );
  wrapper.append(start);
  return wrapper;
}

function confirmBox(resume: Resume, wrapper: HTMLElement, start: HTMLElement): HTMLElement {
  const box = el('div', 'confirm');
  const question = el('p');
  question.append(
    'Permanently delete ',
    el('strong', undefined, `“${resume.title}”`),
    '? This deletes everything in it and cannot be undone.'
  );
  const error = el('p', 'error');

  const cancel = el('button', 'button', 'Cancel');
  cancel.setAttribute('type', 'button');
  cancel.addEventListener('click', () => wrapper.replaceChildren(start));

  const confirm = el('button', 'button danger solid', 'Delete');
  confirm.setAttribute('type', 'button');
  confirm.addEventListener('click', async () => {
    confirm.setAttribute('disabled', '');
    cancel.setAttribute('disabled', '');
    confirm.textContent = 'Deleting…';
    error.textContent = '';
    try {
      const result = (await app.callServerTool({
        // if user asks to delete, the delete_resumes tool is called, which does the actual deletion on the server
        name: 'delete_resumes',
        arguments: { resumes: [{ resumeId: resume.resumeId, confirmTitle: resume.title }] },
      })) as ToolResult;
      if (result.isError) throw new Error(textOf(result) || 'Could not delete this resume.');

      const { message } = JSON.parse(textOf(result)) as { message: string };
      await tellModel(
        `The user deleted a resume with the Delete button in the Follio app. ${message}`
      );
      await refreshList(message);
    } catch (failure) {
      error.textContent = failure instanceof Error ? failure.message : String(failure);
      confirm.removeAttribute('disabled');
      cancel.removeAttribute('disabled');
      confirm.textContent = 'Delete';
    }
  });

  const buttons = el('div', 'buttons');
  buttons.append(cancel, confirm);
  box.append(question, error, buttons);
  return box;
}

/** A section with a heading, or nothing when it has no items. */
function section(title: string, items: HTMLElement[]): HTMLElement[] {
  return items.length === 0 ? [] : [el('h2', undefined, title), ...items];
}

function bulletList(lines: string[]): HTMLElement {
  const list = el('ul');
  for (const line of lines) list.append(el('li', undefined, line));
  return list;
}

// SCREEN 2: one resume, fetched by calling get_resume through the host.
async function showResume(resumeId: string, resumes: ResumeItem[]) {
  showMessage('Loading resume…');

  let resume: Resume;
  try {
    const result = (await app.callServerTool({
      name: 'get_resume',
      arguments: { resumeId },
    })) as ToolResult;
    if (result.isError) {
      showMessage(textOf(result) || 'Could not load that resume.');
      return;
    }
    resume = JSON.parse(textOf(result)) as Resume;
  } catch (error) {
    showMessage(`Could not load that resume: ${error instanceof Error ? error.message : error}`);
    return;
  }

  const back = el('button', 'link', '← All resumes');
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => showList(resumes));

  const experiences = resume.experiences.map((job) => {
    const item = el('div', 'entry');
    item.append(
      el('strong', undefined, `${job.role} · ${job.company}`),
      el(
        'p',
        'small muted',
        [dateRange(job.startDate, job.endDate, job.isCurrent), job.location]
          .filter(Boolean)
          .join(' · ')
      ),
      bulletList(job.bullets)
    );
    return item;
  });

  const education = resume.education.map((school) => {
    const item = el('div', 'entry');
    item.append(
      el('strong', undefined, school.institution),
      el(
        'p',
        'small muted',
        [
          [school.degree, school.fieldOfStudy].filter(Boolean).join(', '),
          dateRange(school.startDate, school.endDate, school.isCurrent),
        ]
          .filter(Boolean)
          .join(' · ')
      )
    );
    return item;
  });

  const projects = resume.projects.map((project) => {
    const item = el('div', 'entry');
    item.append(el('strong', undefined, project.title));
    if (project.techStack.length > 0) {
      item.append(el('p', 'small muted', project.techStack.join(' · ')));
    }
    if (project.description) item.append(el('p', undefined, project.description));
    if (project.highlights.length > 0) item.append(bulletList(project.highlights));
    return item;
  });

  const skills = el('div', 'chips');
  for (const skill of resume.skills) skills.append(el('span', 'chip', skill));

  const top = el('div', 'detail-top');
  top.append(back, openButton(resume, resumes));

  root.replaceChildren(
    top,
    el('p', 'small muted', resume.title),
    el('h1', undefined, resume.name || resume.title),
    ...[el('p', 'headline', resume.headline), el('p', 'muted', resume.location)].filter(
      (node) => node.textContent
    ),
    ...section('Summary', resume.summary ? [el('p', undefined, resume.summary)] : []),
    ...section('Experience', experiences),
    ...section('Education', education),
    ...section('Projects', projects),
    ...section('Skills', resume.skills.length > 0 ? [skills] : []),
    deleteButton(resume)
  );
}

/** Match the host's light or dark theme, colors and fonts (claude.ai sends these). */
function applyHostLook(context: McpUiHostContext | undefined) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

// When the AI calls list_resumes, the host sends its result here.
app.addEventListener('toolresult', (result) => {
  if (result.isError) {
    showMessage(textOf(result) || 'Could not load your resumes.');
    return;
  }
  try {
    const { resumes } = JSON.parse(textOf(result)) as { resumes: ResumeItem[] };
    showList(resumes);
  } catch {
    showMessage('Could not read the resume list.');
  }
});

app.addEventListener('hostcontextchanged', (context) => applyHostLook(context));

// Connect last, so the listeners above are ready before the host sends anything.
app
  .connect()
  .then(() => applyHostLook(app.getHostContext()))
  .catch((error: unknown) => showMessage(`Could not connect to the host: ${error}`));
