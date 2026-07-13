#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki を正として JD → 和暦・フォーマットの対照表 CSV を生成する。
# 再生成時のみ手元で実行する (CI では実行しない。CSV はコミット済み)。
# 実行には ya_kansuji gem が必要: gem install ya_kansuji
# 参照元は WAREKI_DIR (既定 ../wareki)。.git を持たないチェックアウト
# (例: git archive で展開したタグ) から生成する場合は WAREKI_PROVENANCE に
# バージョン文字列を明示する (例: WAREKI_PROVENANCE=v2.0.0)。
require 'csv'
wareki_dir = ENV['WAREKI_DIR'] || File.expand_path('../../wareki', __dir__)
wareki_lib = File.join(wareki_dir, 'lib')
$LOAD_PATH.unshift wareki_lib
require 'wareki'

def wareki_provenance(wareki_dir)
  return ENV['WAREKI_PROVENANCE'] if ENV['WAREKI_PROVENANCE']

  out = `git -C #{wareki_dir} describe --always --dirty 2>/dev/null`.strip
  $?.success? && !out.empty? ? out : 'unknown'
end

provenance = wareki_provenance(wareki_dir)

jds = []
# 旧暦全期間 + 近代グレゴリオ域 (〜西暦2062年ごろ) を37日刻みでサンプリング
(1_883_618..2_465_000).step(37) { |jd| jds << jd }
# 全元号 (南北朝含む) の境界 ±1
(Wareki::ERA_DEFS + Wareki::ERA_NORTH_DEFS).each do |e|
  jds.concat [e.start - 1, e.start, e.start + 1]
  next if e.end > 3_000_000 # 継続中元号 (DAY_MAX) はスキップ
  jds.concat [e.end - 1, e.end, e.end + 1]
end
# Ruby spec に登場する日付と改暦境界
jds.concat [2400508, 2457251, 1956842, 2139493, 2139492, 2335942, 2168353, 2168529,
            2153704, 2404833, 2405159, 2405160, 2447528, 2458485, 2458604, 2458605]
jds = jds.select { |j| j >= 1_883_618 && j <= 2_465_000 }.uniq.sort

File.open(File.expand_path('../test/golden/conversions.csv', __dir__), 'w') do |file|
  file.puts "# wareki: #{provenance}"
  csv = CSV.new(file)
  csv << %w(jd era eraYear year month day isLeap jF jf)
  jds.each do |jd|
    begin
      w = Wareki::Date.jd(jd)
      csv << [jd, w.era_name, w.era_year, w.year, w.month, w.day, w.leap_month?,
              w.strftime('%JF'), w.strftime('%Jf')]
    rescue Wareki::UnsupportedDateRange
      csv << [jd, 'UNSUPPORTED', '', '', '', '', '', '', '']
    end
  end
end
puts "rows: #{jds.size}"
