#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby 版 wareki を正として JD → 和暦・フォーマットの対照表 CSV を生成する。
# 再生成時のみ手元で実行する (CI では実行しない。CSV はコミット済み)。
# 実行には ya_kansuji gem が必要: gem install ya_kansuji
# ../wareki は branch fix/north-court-era-priority を checkout しておくこと
# (元号解決は北朝優先=master 従来挙動、%JF/%Jf 書式は fix/2026-07-13-review 由来)。
require 'csv'
wareki_lib = File.expand_path('../../wareki/lib', __dir__)
$LOAD_PATH.unshift wareki_lib
require 'wareki'

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

CSV.open(File.expand_path('../test/golden/conversions.csv', __dir__), 'w') do |csv|
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
