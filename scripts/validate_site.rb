#!/usr/bin/env ruby

require "date"
require "json"
require "pathname"
require "yaml"

ROOT = Pathname.new(__dir__).parent
SITE = ROOT.join(ARGV[0] || "_site")
errors = []
check = lambda do |condition, message|
  errors << message unless condition
end

def read_json(path, errors)
  JSON.parse(path.read)
rescue Errno::ENOENT
  errors << "missing generated file: #{path}"
  {}
rescue JSON::ParserError => e
  errors << "invalid JSON in #{path}: #{e.message}"
  {}
end

def front_matter(path, errors)
  match = path.read.match(/\A---\s*\n(.*?)\n---\s*(?:\n|\z)/m)
  unless match
    errors << "missing front matter: #{path.relative_path_from(ROOT)}"
    return {}
  end

  YAML.safe_load(match[1], permitted_classes: [Date, Time], aliases: true) || {}
rescue Psych::SyntaxError => e
  errors << "invalid front matter in #{path.relative_path_from(ROOT)}: #{e.message}"
  {}
end

manifest = read_json(SITE.join("site-manifest.json"), errors)
content = read_json(SITE.join("site-content.json"), errors)

check.call(manifest["schema"] == 1, "site-manifest.json must use schema 1")
check.call(content["schema"] == 1, "site-content.json must use schema 1")
check.call(manifest["version"] == content["version"], "manifest/content versions differ")

license = ROOT.join("LICENSE")
content_license = ROOT.join("content/LICENSE")
check.call(license.file? && license.read.start_with?("MIT License"), "root MIT License is required")
check.call(content_license.file? && content_license.read.include?("creativecommons.org/licenses/by/4.0"), "CC BY 4.0 content license is required")
check.call(SITE.join("LICENSE").file?, "MIT License must be published with the site")
check.call(SITE.join("content/LICENSE").file?, "content license must be published with the site")

profile = manifest["profile"] || {}
%w[name title description].each do |key|
  check.call(profile[key].is_a?(String) && !profile[key].empty?, "manifest profile.#{key} is required")
end

sections = manifest["sections"] || []
routes = manifest["routes"] || []
content_pages = content["pages"] || {}
allowed_types = %w[page post read fragment photo use publication]

check.call(sections.is_a?(Array) && !sections.empty?, "manifest sections must be a non-empty array")
check.call(routes.is_a?(Array) && !routes.empty?, "manifest routes must be a non-empty array")
check.call(content_pages.is_a?(Hash), "content pages must be an object")

section_names = sections.map { |section| section["name"] }
check.call(section_names.compact.uniq.length == section_names.length, "manifest section names must be unique")

declared_types = sections.flat_map { |section| section["types"] || [] }
check.call(declared_types.uniq.length == declared_types.length, "content types may belong to only one section")

route_ids = routes.map { |route| route["id"] }
check.call(route_ids.compact.uniq.length == route_ids.length, "manifest route ids must be unique")

routes.each do |route|
  label = route["id"] || route.inspect
  %w[id type name title url].each do |key|
    check.call(route[key].is_a?(String) && !route[key].empty?, "route #{label} requires #{key}")
  end
  check.call(allowed_types.include?(route["type"]), "route #{label} has unknown type #{route['type']}")
  check.call(route["tags"].is_a?(Array), "route #{label} tags must be an array")
  check.call(route["size"].is_a?(Integer) && route["size"] >= 0, "route #{label} size must be non-negative")
  if route["type"] != "page"
    check.call(declared_types.include?(route["type"]), "route #{label} is not assigned to a section")
  end
end

missing_content = route_ids - content_pages.keys
orphaned_content = content_pages.keys - route_ids
check.call(missing_content.empty?, "routes missing content: #{missing_content.join(', ')}")
check.call(orphaned_content.empty?, "content without routes: #{orphaned_content.join(', ')}")

content_pages.each do |id, page|
  check.call(page["content"].is_a?(String), "content #{id} must contain text")
end

legacy_outputs = %w[site-page-index.json site-page-content.json].select { |name| SITE.join(name).exist? }
check.call(legacy_outputs.empty?, "legacy data outputs still exist: #{legacy_outputs.join(', ')}")

html_files = SITE.glob("**/*.html")
html_files.each do |path|
  check.call(!path.read.include?('id="site-data"'), "legacy embedded site-data found in #{path.relative_path_from(SITE)}")
end

index_html = SITE.join("index.html")
if index_html.exist?
  html = index_html.read
  script_order = %w[site-data.js site-ai.js terminal.js].map { |name| html.index(name) }
  check.call(script_order.all? && script_order == script_order.sort, "shared data and AI scripts load in the wrong order")
end

post_pages = SITE.glob("posts/*/index.html")
post_pages.each do |path|
  check.call(path.read.include?("post-toc.js"), "post TOC script missing from #{path.relative_path_from(SITE)}")
end
(html_files - post_pages).each do |path|
  check.call(!path.read.include?("post-toc.js"), "post TOC script loaded outside a post: #{path.relative_path_from(SITE)}")
end

bibtex_pages = [SITE.join("research/index.html")] + SITE.glob("publications/*/index.html")
bibtex_pages.select(&:exist?).each do |path|
  check.call(path.read.include?('id="bibtex-modal"'), "BibTeX modal missing from #{path.relative_path_from(SITE)}")
end
(html_files - bibtex_pages).each do |path|
  check.call(!path.read.include?('id="bibtex-modal"'), "BibTeX modal rendered on unrelated page: #{path.relative_path_from(SITE)}")
end

fragment_html = SITE.join("fragments/index.html")
if fragment_html.exist?
  html = fragment_html.read
  routes.select { |route| route["type"] == "fragment" }.each do |route|
    anchor = route["url"].to_s.split("#", 2)[1]
    check.call(anchor && html.include?(%(id="#{anchor}")), "fragment #{route['id']} has no matching anchor")
  end
end

requirements = {
  "content/_posts" => %w[title date categories],
  "content/_fragments" => %w[date type],
  "content/_photos" => %w[title date photos],
  "content/_publications" => %w[title authors venue year abstract],
  "content/_uses" => %w[title version role status official_url summary],
  "content/_reads" => %w[title date source summary category]
}

requirements.each do |directory, keys|
  ROOT.join(directory).glob("*.md").each do |path|
    data = front_matter(path, errors)
    keys.each do |key|
      value = data[key]
      present = value.is_a?(Array) ? !value.empty? : !value.nil? && value.to_s != ""
      check.call(present, "#{path.relative_path_from(ROOT)} requires #{key}")
    end
  end
end

# A fragment has no title or summary field, so its body is the entire payload.
# An empty body renders as a bare type label and date with nothing underneath.
# The collection itself may legitimately be empty, so only existing documents are
# checked -- requiring at least one entry would block emptying a curated collection.
ROOT.join("content/_fragments").glob("*.md").each do |path|
  raw = path.read
  match = raw.match(/\A---\s*\n(.*?)\n---\s*(?:\n|\z)/m)
  body = match ? raw[match.end(0)..].to_s : raw
  check.call(!body.strip.empty?, "fragment #{path.basename('.md')} has an empty body")
end

# A shared link without a recommendation has no value to a reader, so the
# recommendation is required and length-checked rather than free text.
read_summary_min = 40
read_entries = ROOT.join("content/_reads").glob("*.md").map do |path|
  { path: path, slug: path.basename(".md").to_s, data: front_matter(path, errors) }
end

read_entries.each do |entry|
  slug = entry[:slug]
  data = entry[:data]
  source = data["source"].is_a?(Hash) ? data["source"] : {}
  url = source["url"].to_s

  check.call(data["summary"].to_s.strip.length >= read_summary_min, "read #{slug} summary must be at least #{read_summary_min} characters")
  check.call(url.start_with?("https://"), "read #{slug} source.url must use HTTPS")
  check.call(source["site"].to_s.strip != "", "read #{slug} requires source.site")
  check.call(data["category"].to_s.strip != "", "read #{slug} requires a non-empty category")
  check.call(data["published"].nil? || data["published"].is_a?(Date), "read #{slug} published must be a date")

  detail = SITE.join("reads", slug, "index.html")
  check.call(detail.file?, "read #{slug} page was not generated at /reads/#{slug}/")
  next unless detail.file?

  body = detail.read
  check.call(body.include?(url), "read #{slug} page must link to the original: #{url}")
  check.call(body.include?("read-summary"), "read #{slug} page must render the recommendation block")
end

reads_index = SITE.join("reads", "index.html")
check.call(reads_index.file?, "reads index page was not generated at /reads/")
if reads_index.file?
  index_body = reads_index.read
  read_entries.each do |entry|
    title = entry[:data]["title"].to_s
    next if title.empty?
    check.call(index_body.include?(title), "reads index is missing #{entry[:slug]}")
  end
end

dashboard_uses = YAML.safe_load(ROOT.join("_data/uses.yml").read, aliases: true) || []
input_devices = dashboard_uses.find { |group| group["label"] == "INPUT_DEVICES" }
check.call(input_devices, "_data/uses.yml requires INPUT_DEVICES")

if input_devices
  use_slugs = ROOT.join("content/_uses").glob("*.md").map { |path| path.basename(".md").to_s }
  duplicated_fields = %w[name url official_url version driver]

  (input_devices["items"] || []).each do |item|
    id = item["id"]
    check.call(use_slugs.include?(id), "dashboard use #{id.inspect} has no content/_uses document")
    duplicates = duplicated_fields.select { |field| item.key?(field) }
    check.call(duplicates.empty?, "dashboard use #{id} duplicates content fields: #{duplicates.join(', ')}")
  end
end

unless errors.empty?
  warn errors.map { |message| "- #{message}" }.join("\n")
  exit 1
end

puts "Validated #{routes.length} routes, #{content_pages.length} content entries, and #{html_files.length} HTML pages."
