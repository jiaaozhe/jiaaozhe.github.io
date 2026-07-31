#!/usr/bin/env ruby

require "date"
require "digest"
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
third_party_notices = ROOT.join("THIRD_PARTY_NOTICES")
check.call(license.file? && license.read.start_with?("MIT License"), "root MIT License is required")
check.call(content_license.file? && content_license.read.include?("creativecommons.org/licenses/by/4.0"), "CC BY 4.0 content license is required")
check.call(third_party_notices.file?, "third-party notices are required")
check.call(SITE.join("LICENSE").file?, "MIT License must be published with the site")
check.call(SITE.join("content/LICENSE").file?, "content license must be published with the site")
check.call(SITE.join("THIRD_PARTY_NOTICES").file?, "third-party notices must be published with the site")

profile = manifest["profile"] || {}
%w[name title description].each do |key|
  check.call(profile[key].is_a?(String) && !profile[key].empty?, "manifest profile.#{key} is required")
end

sections = manifest["sections"] || []
routes = manifest["routes"] || []
content_pages = content["pages"] || {}
allowed_types = %w[page post fragment photo use publication tool]

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
  "content/_tools" => %w[title summary category status runtime entry source_url provenance storage capabilities]
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

allowed_tool_capabilities = %w[scripts downloads modals fullscreen forms]
ROOT.join("content/_tools").glob("*.md").each do |path|
  data = front_matter(path, errors)
  slug = path.basename(".md").to_s
  entry = data["entry"].to_s.sub(%r{\A/}, "")
  app_dir = ROOT.join(entry)
  app_index = app_dir.directory? ? app_dir.join("index.html") : app_dir
  capabilities = data["capabilities"] || []
  network_hosts = data["network"] || []
  provenance = data["provenance"].to_s

  check.call(capabilities.is_a?(Array), "tool #{slug} capabilities must be an array")
  capabilities = [] unless capabilities.is_a?(Array)
  check.call(network_hosts.is_a?(Array), "tool #{slug} network must be an array")
  network_hosts = [] unless network_hosts.is_a?(Array)

  check.call(data["runtime"] == "sandbox", "tool #{slug} must use sandbox runtime")
  check.call(data["storage"] == "bridged", "tool #{slug} must use bridged storage")
  check.call(data["source_url"].to_s.start_with?("https://"), "tool #{slug} source_url must use HTTPS")
  check.call(%w[native vendored].include?(provenance), "tool #{slug} must declare native or vendored provenance")
  check.call(capabilities.include?("scripts"), "tool #{slug} must declare scripts capability")
  unknown_capabilities = capabilities - allowed_tool_capabilities
  check.call(unknown_capabilities.empty?, "tool #{slug} has unknown capabilities: #{unknown_capabilities.join(', ')}")
  check.call(!capabilities.include?("same-origin"), "tool #{slug} must not request same-origin")
  check.call(app_index.file?, "tool #{slug} entry does not exist: #{app_index.relative_path_from(ROOT)}")

  if provenance == "vendored"
    check.call(data["license"].to_s != "", "vendored tool #{slug} must declare a license")
    check.call(data["upstream_commit"].to_s.match?(/\A[0-9a-f]{40}\z/), "tool #{slug} must pin a full upstream commit")
    check.call(app_dir.join("LICENSE").file?, "tool #{slug} must include LICENSE")
    check.call(app_dir.join("upstream.yml").file?, "tool #{slug} must include upstream.yml")
  end

  if provenance == "vendored" && app_dir.join("upstream.yml").file?
    upstream = YAML.safe_load(app_dir.join("upstream.yml").read, aliases: true) || {}
    check.call(upstream["commit"] == data["upstream_commit"], "tool #{slug} upstream commit metadata differs")
    check.call(upstream["license"] == data["license"], "tool #{slug} license metadata differs")
    (upstream["original_sha256"] || {}).each do |name, expected|
      next if name == "index.html"
      vendored_file = app_dir.join(name)
      check.call(vendored_file.file?, "tool #{slug} is missing vendored file #{name}")
      if vendored_file.file?
        actual = Digest::SHA256.file(vendored_file).hexdigest
        check.call(actual == expected, "tool #{slug} vendored file changed unexpectedly: #{name}")
      end
    end
  end

  dependencies_path = app_dir.join("dependencies.yml")
  check.call(dependencies_path.file?, "tool #{slug} vendor directory requires dependencies.yml") if app_dir.join("vendor").directory?
  if dependencies_path.file?
    dependencies = YAML.safe_load(dependencies_path.read, aliases: true) || {}
    dependency_list = dependencies["dependencies"] || []
    dependency_hashes = dependencies["sha256"] || {}
    check.call(dependency_list.is_a?(Array) && !dependency_list.empty?, "tool #{slug} dependencies must be a non-empty array")
    dependency_list = [] unless dependency_list.is_a?(Array)
    dependency_list.each do |dependency|
      unless dependency.is_a?(Hash)
        check.call(false, "tool #{slug} dependency entries must be objects")
        next
      end
      %w[name version license source].each do |key|
        check.call(dependency[key].to_s != "", "tool #{slug} dependency requires #{key}")
      end
    end
    check.call(dependency_hashes.is_a?(Hash) && !dependency_hashes.empty?, "tool #{slug} dependencies require SHA-256 hashes")
    dependency_hashes = {} unless dependency_hashes.is_a?(Hash)
    dependency_hashes.each do |name, expected|
      relative = Pathname.new(name.to_s)
      safe_path = !relative.absolute? && !relative.each_filename.include?("..")
      check.call(safe_path, "tool #{slug} dependency path is unsafe: #{name}")
      next unless safe_path
      vendored_file = app_dir.join(relative)
      check.call(vendored_file.file?, "tool #{slug} dependency is missing: #{name}")
      if vendored_file.file?
        actual = Digest::SHA256.file(vendored_file).hexdigest
        check.call(actual == expected, "tool #{slug} dependency changed unexpectedly: #{name}")
      end
    end
    if app_dir.join("vendor").directory?
      vendor_files = app_dir.join("vendor").glob("**/*").select(&:file?).map do |vendor_file|
        vendor_file.relative_path_from(app_dir).to_s
      end
      unhashed_files = vendor_files - dependency_hashes.keys.map(&:to_s)
      check.call(unhashed_files.empty?, "tool #{slug} has unhashed vendor files: #{unhashed_files.join(', ')}")
    end
  end

  thumbnail = data["thumbnail"].to_s.sub(%r{\A/}, "")
  check.call(ROOT.join(thumbnail).file?, "tool #{slug} thumbnail does not exist")

  if app_index.file?
    source = app_index.read
    check.call(source.include?("Content-Security-Policy"), "tool #{slug} must define a CSP")
    check.call(source.include?("tool-runtime.js"), "tool #{slug} must load tool-runtime.js")
    check.call(!source.include?("localStorage"), "tool #{slug} must not access localStorage directly")
    if source.include?("marked.parse")
      check.call(source.include?("DOMPurify.sanitize"), "tool #{slug} must sanitize rendered Markdown HTML")
    end
    if source.include?("mermaid.initialize")
      check.call(source.include?("securityLevel: 'strict'"), "tool #{slug} must use strict Mermaid security")
    end
    check.call(!source.include?("npm/marked/marked.min.js"), "tool #{slug} uses an unpinned Marked dependency")
    check.call(!source.include?("npm/mermaid@10/dist"), "tool #{slug} uses an unpinned Mermaid dependency")
    cdn_tags = source.scan(%r{<(?:script|link)\b[^>]*(?:src|href)="https://cdn\.jsdelivr\.net/[^"]+"[^>]*>})
    cdn_tags.each do |tag|
      check.call(tag.include?('integrity="sha384-'), "tool #{slug} CDN asset is missing SHA-384 integrity")
      check.call(tag.include?('crossorigin="anonymous"'), "tool #{slug} CDN asset is missing anonymous CORS")
    end
    network_hosts.each do |host|
      check.call(source.include?("https://#{host}"), "tool #{slug} CSP does not allow declared host #{host}")
    end
    if network_hosts.empty?
      connect_sources = source[/connect-src\s+([^;\"]+)/, 1].to_s.split
      local_only = connect_sources == ["'none'"] ||
        (!connect_sources.empty? && (connect_sources - ["'self'", "blob:"]).empty?)
      check.call(local_only, "offline tool #{slug} must limit connections to local assets")
    end
  end

  runner = SITE.join("tools", slug, "index.html")
  check.call(runner.file?, "tool #{slug} runner was not generated")
  if runner.file?
    runner_html = runner.read
    sandbox = runner_html[/sandbox="([^"]*)"/, 1].to_s
    check.call(sandbox.include?("allow-scripts"), "tool #{slug} runner must allow scripts")
    check.call(!sandbox.include?("allow-same-origin"), "tool #{slug} runner must omit allow-same-origin")
    check.call(!runner_html.include?("cat-bot.js"), "tool #{slug} runner must not load global site interactions")
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
