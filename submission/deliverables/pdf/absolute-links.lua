-- Rewrites repository-relative links to absolute URLs for documents published outside GitHub.
-- A path listed in links.json with a non-empty URL goes to that URL; everything else goes to the repository.
local REPO = 'https://github.com/avbelkin/nasa-space-apps-sg/blob/main/'
local HERE = 'submission/deliverables/'

local published = {}
local file = io.open(os.getenv('LINKS_JSON') or 'links.json', 'r')
if file then
  published = pandoc.json.decode(file:read('a'), false)
  file:close()
end

local function normalize(path)
  local parts = {}
  for part in path:gmatch('[^/]+') do
    if part == '..' then
      table.remove(parts)
    elseif part ~= '.' then
      parts[#parts + 1] = part
    end
  end
  return table.concat(parts, '/')
end

function Link(link)
  local target = link.target
  if target:match('^%a[%w+.-]*:') or target:match('^#') then
    return nil
  end
  local path, anchor = target:match('^([^#]*)(#?.*)$')
  local repoPath = normalize(HERE .. path)
  local url = published[repoPath]
  if url and url ~= '' then
    link.target = url
  else
    link.target = REPO .. repoPath .. anchor
  end
  return link
end

function CodeBlock(block)
  if block.classes:includes('mermaid') then
    local text = block.text:gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;')
    return pandoc.RawBlock('html', '<pre class="mermaid">' .. text .. '</pre>')
  end
end
