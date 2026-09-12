#!/usr/bin/env ruby
# Fingerprint direct local tool assets after Jekyll copies the standalone apps.
require "digest"
require "pathname"

site = Pathname.new(ARGV[0] || "_site").expand_path
count = 0
site.glob("tool-apps/*/index.html").each do |page|
  original = page.read
  versioned = original.gsub(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")([^"?#]+)(?:\?[^"#]*)?("[^>]*>)/) do
    prefix, url, suffix = Regexp.last_match.captures
    next Regexp.last_match[0] if url.match?(%r{\A(?:[a-z]+:|//|/)})
    asset = page.dirname.join(url).cleanpath
    next Regexp.last_match[0] unless asset.file? && asset.to_s.start_with?(site.to_s + "/")
    count += 1
    "#{prefix}#{url}?v=#{Digest::SHA256.file(asset).hexdigest[0, 16]}#{suffix}"
  end
  page.write(versioned) unless versioned == original
end
puts "Versioned #{count} local tool asset references."
