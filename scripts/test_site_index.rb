#!/usr/bin/env ruby
# frozen_string_literal: true

require "jekyll"
require "json"
require "tmpdir"

root = File.expand_path("..", __dir__)

def assert(condition, message)
  raise message unless condition
end

Dir.mktmpdir("site-index-") do |destination|
  config = Jekyll.configuration("source" => root, "destination" => destination, "baseurl" => "/preview", "quiet" => true)
  config["time"] = Time.now
  indexes = [false, true].map do |reverse|
    site = Jekyll::Site.new(config)
    site.reset
    site.read
    site.generate
    fragments = site.collections.fetch("fragments")
    fragment = Jekyll::Document.new(File.join(root, "content/_fragments/index-regression.md"), site: site, collection: fragments)
    fragment.data.merge!("date" => Time.utc(2026, 1, 1), "type" => "想法", "slug" => "index-regression")
    fragment.content = "**Rendered fragment** by {{ site.author }}."
    fragments.docs << fragment
    # Use fresh source objects for both orders; rerendering converted content
    # could hide precisely the order dependency this regression guards against.
    site.pages.reverse! if reverse
    site.render
    %w[site-manifest.json site-content.json].map do |name|
      JSON.parse(site.pages.find { |page| page.name == name }.output)
    end
  end
  assert(indexes[0] == indexes[1], "indexes changed when page render order changed")
  manifest, content = indexes.first
  assert(manifest["routes"].all? { |route| route["url"].start_with?("/preview/") }, "index routes lost baseurl")
  assert(content["pages"].keys.all? { |id| id.start_with?("/preview/") }, "content ids lost baseurl")
  status = content["pages"].fetch("/preview/status/").fetch("content")
  agents = YAML.safe_load(File.read(File.join(root, "_data/agents.yml")))
  assert(status.include?(agents.first["name"]), "status index is missing rendered data")
  assert(!status.match?(/\{%|\{\{/), "status index still contains Liquid")
  assert(!status.include?("Ask AI"), "index must exclude the shared site shell")
  fragment = content["pages"].fetch("/preview/fragments/#index-regression")
  assert(fragment["content"] == "Rendered fragment by jiaaozhe.", "non-output collection content must be rendered")
  assert(fragment["url"] == "/preview/fragments/#index-regression", "fragment links must preserve their anchor")
end

puts "Validated index render order, rendered data, and baseurl."
