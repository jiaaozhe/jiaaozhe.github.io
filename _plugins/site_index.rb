# frozen_string_literal: true

require "cgi"
require "json"

module SiteIndex
  class Builder
    def initialize(site)
      @site = site
      @filters = Object.new.extend(Liquid::StandardFilters)
      @sections = site.data.fetch("sections")
      @routes = []
      @pages = {}
    end

    def build
      # At site:post_render, content is converted HTML without the site layout.
      # Reading it earlier makes the index depend on page rendering order.
      @site.pages.select { |page| page.html? && page.url !~ /404/ }.sort_by(&:url).each do |page|
        add(page, "page", text(page.content), page.url == "/" ? "home" : page.basename)
      end

      @sections.each do |section|
        collection = @site.collections.fetch(section.fetch("collection"))
        docs = collection.docs.sort_by(&:relative_path)
        if %w[posts reads fragments].include?(section["collection"])
          docs = docs.sort_by { |doc| [doc.data["date"].to_s, doc.relative_path] }.reverse
        end
        docs.each do |doc|
          type = section.fetch("type")
          slug = doc.data["slug"] || File.basename(doc.relative_path, doc.extname)
          name = type == "post" ? "#{slug}.md" : slug
          url = type == "fragment" ? "/fragments/##{slug}" : doc.url
          add(doc, type, document_text(doc, type), name, url)
        end
      end

      version = @site.time.xmlschema
      manifest = {
        "schema" => 1, "version" => version, "baseurl" => @site.baseurl.to_s,
        "profile" => {
          "name" => @site.config["author"], "title" => @site.config["title"],
          "description" => @site.config["description"],
          "focus" => "Multimodal Representation / Automation",
          "research" => "Unified multimodal understanding, contrastive learning, and applied automation."
        },
        "terminal" => {
          "user" => @site.config.fetch("terminal_user", "jiaaozhe"),
          "host" => @site.config.fetch("terminal_host", "site")
        },
        "sections" => @sections.map do |section|
          section.slice("name", "title").merge("url" => relative_url(section["url"]), "types" => [section["type"]])
        end,
        "routes" => @routes
      }
      publish("site-manifest.json", manifest)
      publish("site-content.json", { "schema" => 1, "version" => version, "pages" => @pages })
    end

    private

    def relative_url(url)
      @site.baseurl.to_s.sub(%r{/+$}, "") + url
    end

    def text(html)
      CGI.unescapeHTML(@filters.strip_html(html.to_s)).strip
    end

    def markdown(value)
      @site.find_converter_instance(Jekyll::Converters::Markdown).convert(value.to_s)
    end

    def document_text(doc, type)
      data = doc.data
      body = text(doc.content)
      case type
      when "read"
        source = data.fetch("source", {})
        [data["summary"], "来源：#{source['site']} #{source['author']}".strip, "原文：#{source['url']}", body].join("\n")
      when "photo"
        captions = Array(data["photos"]).map { |item| "照片：#{item['caption'] || item['title'] || item['alt']}" }
        [body, data["camera"] && "相机：#{data['camera']}", data["summary"], *captions].compact.join("\n")
      when "publication"
        text(markdown(data["abstract"] || doc.content))
      else
        body
      end
    end

    def add(item, type, body, name, url = item.url)
      data = item.data
      id = relative_url(url)
      title = data["title"] || data["type"] || name
      summary = data["summary"] || data["description"] || data["abstract"]
      summary ||= type == "post" ? data["excerpt"].to_s : body
      tags = case type
             when "post" then data["categories"]
             when "fragment" then [data["type"] || "碎片"]
             when "use" then ["uses"]
             when "publication" then ["research"]
             else data["tags"]
             end
      date = if type == "publication"
               data["year"].to_s
             elsif type == "page" || type == "use"
               ""
             else
               data["date"]&.strftime("%Y-%m-%d").to_s
             end
      source_path = item.relative_path
      raw_url = if %w[post read].include?(type)
                  "https://raw.githubusercontent.com/#{@site.config['source_repository']}/#{@site.config.fetch('raw_branch', 'main')}/#{source_path.delete_prefix('/')}"
                else
                  ""
                end
      @routes << {
        "id" => id, "type" => type, "name" => name, "title" => title,
        "url" => id, "date" => date, "summary" => @filters.truncate(text(summary), 220),
        "tags" => Array(tags), "source_path" => source_path,
        "raw_url" => raw_url, "size" => body.bytesize
      }
      @pages[id] = { "id" => id, "type" => type, "title" => title, "url" => id, "content" => body }
    end

    def publish(name, payload)
      page = Jekyll::PageWithoutAFile.new(@site, @site.source, "", name)
      page.data["layout"] = nil
      page.content = page.output = JSON.pretty_generate(payload) + "\n"
      @site.pages << page
    end
  end
end

Jekyll::Hooks.register :site, :post_render do |site|
  SiteIndex::Builder.new(site).build
end
