# coding: utf-8

Gem::Specification.new do |spec|
  spec.name          = "story_jekyll_theme"
  spec.version       = "1"
  spec.authors       = ["Yusuf Wadi"]
  spec.email         = ["yusufwadi1@gmail.com"]

  spec.summary       = %q{A Jekyll version of the "Story" theme by HTML5 UP.}
  spec.homepage      = ""
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r{^(assets|_layouts|_includes|_sass|LICENSE|README)}i) }

  spec.add_development_dependency "jekyll", "~> 4.0"
  spec.add_development_dependency "bundler", "~> 2.2"
end
