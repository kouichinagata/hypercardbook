import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabase = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const horrorMarkdown = `---
id: the-creeping-steps-interactive
title: 階段を上る足音（怪奇音響・視覚演出版）
play_mode: book
author: kouichi.nagata
cover_image: https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80
theme_color: black
---

都内の格安アパートの最上階、404号室。
それが、私の新しい住処だった。

古い鉄筋コンクリート造りの建物は、夜になると不気味なほど静まり返る。
その「音」が聞こえ始めたのは、引っ越してきて最初の週末のことだった。

![古いアパート](https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_far

深夜の午前二時。
外の静寂を切り裂くように、コンクリートを叩く音が響いた。

「コツン……, コツン……」

それは、重く、湿った足音だった。
誰かが外の非常階段を上ってきている。
だが、その歩みは異様なほどに遅かった。

![夜の非常階段](https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80)

***

最初は、酔っ払った住人だろうと思っていた。
しかし、足音は一階の踊り場でピタリと止まった。

それきり、音はしなくなった。
私は張り詰めていた息を吐き出し、布団に潜り込んだ。
ただの気のせいだ、と自分に言い聞かせながら。

![暗い部屋の天井](https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_mid

翌日の深夜。
再び、同じ時刻に目が覚めた。

「コツン……, コツン……」

やはり、あの足音だ。
しかし昨日とは明らかに違う点があった。
足音は一階を通り過ぎ、二階の踊り場へと向かって上り続けている。

![闇に続く階段](https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_drag_far

「ズリ……, コツン……」

よく聞くと、足音の合間に、何か重いものを引きずるような不快な摩擦音が混じっていた。
まるで、動かない足を無理やり引きずって歩いているかのような。

音は二階の踊り場で、またしてもピタリと止まった。

![不穏な気配](https://images.unsplash.com/photo-1505635552518-3448ff116af3?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_near

三日目の夜。
私は恐怖で眠ることができず、部屋の明かりを消したまま、体育座りで時計を見つめていた。

午前二時。
期待を裏切るように、やはり「それ」は始まった。
足音は迷いなく、三階へと上ってくる。

「ズリ……, コツン……。ズリ……, コツン……」

![暗闇の時計](https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se ambient_cold

音が近づくにつれ、部屋の空気が急激に冷えていくのが分かった。
吐く息が白くなる。

足音は三階の私の真下の部屋の前で止まった。
コンクリートの床を通して、冷たい振動が私の背中に直接伝わってくるようだった。

![凍りつく空気](https://images.unsplash.com/photo-1584824486509-112e4181ff6b?auto=format&fit=crop&w=600&q=80)

***

翌朝、私はたまらず管理会社に電話をかけた。
「夜中に不審な足音が聞こえる。確認してほしい」と。

しかし、電話口の担当者は怪訝そうな声でこう言った。
「何を言ってるんですか？ そのアパート、今は<span class="effect-glitch">あなた以外、誰も住んでいませんよ</span>」

![無人の廊下](https://images.unsplash.com/photo-1515162305285-0293e4767cc2?auto=format&fit=crop&w=600&q=80)

***

入居者は私だけ。
一階から三階の部屋はすべて空室。

では、毎晩あの階段を上ってくる「何か」は、一体誰なのだ。
今日は四日目。
このペースなら、今夜、足音は私のいる四階に達する。

![錆びた手すり](https://images.unsplash.com/photo-1540959733332-eab4deceeaf7?auto=format&fit=crop&w=600&q=80)

***

<div class="effect-flash"></div>

逃げ出そうと、私は荷物をまとめた。
だが、玄関のドアを開けようとした瞬間、凄まじい悪寒が走った。

外はすでに完全に暗い。
今、このドアを開けて外に出たら、階段の途中で「それ」と鉢合わせてしまうのではないか。
私はドアを施鍵し、チェーンをかけた。

![閉ざされたドア](https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se heartbeat

<div class="effect-heartbeat"></div>

そして、運命の午前二時が訪れた。

遠くで、鉄の扉がきしむ音が聞こえた。
一階の非常口が開いたのだ。

「ズリ……, コツン……」

ついに、奴が最後の階段を上り始めた。

![迫り来る足音](https://images.unsplash.com/photo-1518331647614-7a1f04bd340e?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_drag_near

足音は、静かに廊下を進んでくる。
私の一人きりの部屋に向かって。

「ズリ……, ズリ……」
もう足音はしない。
ただ、何か濡れた重いものを引きずる音だけが、私の部屋のドアの前でピタリと止まった。

![ドアの向こう側](https://images.unsplash.com/photo-1519074002996-a69e7ac46a42?auto=format&fit=crop&w=600&q=80)

***

沈黙。
世界から音が消えたかのような、恐ろしい静寂。

私はベッドの上で毛布を頭から被り、全身を震わせていた。
お願いだ、どこかへ行ってくれ。
心の中で何度も何度も、神に祈り続けた。

![震える毛布](https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se door_rattle

<div class="effect-flash" style="animation-duration: 0.2s;"></div>

「ガチャリ」

静寂を破ったのは、絶望的な金属音だった。
ドアノブが、ゆっくりと外側から回されている。

「<span class="effect-glitch">カタカタ、カタカタ！</span>」
ノブが激しく揺さぶられる。
チェーンをかけておいて本当によかった。奴は入れない。

![激しく揺れるノブ](https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se wind_blow

<div class="flashlight-bg">

そう安堵した瞬間。
「スウゥ……」と、部屋の中に冷たい風が吹き込んできた。

なせ風が？
窓はすべて閉めているはずだ。

私は恐る恐る、毛布の隙間から部屋の様子を覗き見た。

</div>

![暗い部屋の隙間](https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80)

***

玄関のドアは、閉まったままだ。

しかし。
私のすぐ目の前にある、寝室の「クローゼットの引き戸」が。
何者かの手によって、内側からゆっくりと、音もなく開けられていくのが見えた。

![開くクローゼット](https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se closet_open

そこは、非常階段の壁の裏側に位置する場所。

奴は、最初から外のドアなどから入るつもりはなかったのだ。
コンクリートの壁を、その異形の身体で通り抜け、クローゼットの中に潜んでいた。

暗闇の中に、二つの濁った「眼」が浮かび上がった。

![暗闇の眼](https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se horror_whisper

<div class="effect-flash"></div>

「<span class="effect-glitch" style="font-size: 1.5em;">みつ……けた……</span>」

濡れたような、泥にまみれた声が部屋に響いた。
関節が奇妙な方向に曲がった白い腕が、クローゼットから伸び、私のベッドの縁を掴んだ。

私は叫ぶことすらできず、ただその怪異を見つめるしかなかった。

![伸びる白い手](https://images.unsplash.com/photo-1518331647614-7a1f04bd340e?auto=format&fit=crop&w=600&q=80)

***

これか、私の意識が途絶える前の最後の記憶です。

私はもう、元の世界には戻れません。
しかし、この物語を最後まで読んだあなたに、一つだけ警告があります。

奴は「この話に共感し、最後まで見届けてくれた人」を、次の標的に選ぶ習性があります。

![赤い警告](https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?auto=format&fit=crop&w=600&q=80)

***

/! onOpenPage: play_se footsteps_end

<div class="effect-pulse">

耳を澄ましてみてください。

あなたの家の外から。
あるいは、今あなたがいる部屋のすぐ下の階から。

</div>

「<span class="effect-glitch">ズリ……, コツン……</span>」という音が、
ゆっくりと階段を上り始めていませんか？

![迫る影](https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=600&q=80)`;

const ryomaMarkdown = `---
id: ryoma-childhood-adventure
title: "泣き虫よっちゃん、海を夢見る：坂本龍馬の子供時代"
play_mode: book
author: kouichi.nagata
cover_image: https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80
theme_color: green
on_open_stack: |
  alert('「泣き虫よっちゃん、海を夢見る」へようこそ！よっちゃんの成長を、臨場感あふれる視覚効果と共にお楽しみください。')
---

# 泣き虫よっちゃん、海を夢見る
### 坂本龍馬の子供時代

むかしむかし、江戸時代（えどじだい）の終わりごろ。
四国の土佐（今の高知県）という場所に、一人の男の子がいました。

名前は、**坂本龍馬（さかもとりょうま）**。
お家の人からは「よっちゃん」と呼ばれていました。

のちに日本を大きく動かす大英雄になる龍馬の、子供時代のお話です。

![土佐の美しい自然](https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=800&q=80)

***

# おねしょと、泣き虫

「<span class="effect-glitch">うわぁぁぁん！</span> おねえちゃん、またやっちゃったよ〜！」

朝一番、よっちゃんの泣き声が響きます。
なんと、よっちゃんは10歳近くになっても、おねしょばかりしていたのです。

かけっこをすればいつも一番最後。
いじめっ子にからかわれては、すぐにメソメソと泣いて逃げ帰ってくる、大変な「泣き虫」でした。

![泣き顔のイメージ](https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=800&q=80)

***

# 頼れる大黒柱、乙女姉さん

そんなよっちゃんを、いつも助けてくれたのが、お姉さんの**乙女（おとめ）さん**です。

乙女姉さんは、よっちゃんとは大違い！
背が高くて力持ち、勉強もスポーツも大得意で、男の人にも負けないくらい強いお姉さんでした。

「よっちゃん、また泣いているの？
坂本の家の子が、そんなことでどうするの！」
乙女姉さんは, よっちゃんの涙を力強くふき取りました。

![頼もしいお姉さんのイメージ](https://images.unsplash.com/photo-1542353436-312f02b16299?auto=format&fit=crop&w=800&q=80)

***

# 塾を追い出されちゃった！

ある日、よっちゃんは勉強を習う「塾（じゅく）」で、いじめっ子とケンカをしてしまいました。

「もう、よっちゃんは塾に来なくてよろしい！」
怒った先生に、塾を追い出されてしまいます。

トボトボと家に帰るよっちゃん。
「ボクは勉強もできないし、弱虫だし、ダメな子なのかなぁ……」
すっかり自信をなくして、うつむいていました。

![古い日本の寺子屋のイメージ](https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=800&q=80)

***

# 乙女姉さんのスパルタ特訓！

&nbsp;&nbsp;&nbsp;&nbsp;がっかりするよっちゃんを見て、乙女姉さんが立ち上がりました。
「よし！ 学校に行かないなら、私がよっちゃんを鍛（きた）えてあげる！」

その日から、愛のスパルタ特訓が始まりました。
まずは、体力をつけるための特訓です。

「ほら、よっちゃん！ もっと竹刀をしっかり振って！」
「<span class="effect-heartbeat">ひえぇ〜、お姉ちゃん、もう手が動かないよ〜！</span>」

![木刀での練習](https://images.unsplash.com/photo-1555597673-b21d5c935865?auto=format&fit=crop&w=800&q=80)

***

# 川へドボン！ 泳ぎの練習

次は、近くを流れる「鏡川（かがみがわ）」での泳ぎの特訓です。

「ボク、水に入るの怖いよ……」
もじもじするよっちゃんを、乙女姉さんは容赦なく川へ連れていきます。

「大丈夫、人間は水に浮くようにできているの！ ほら、飛び込んで！」

ドボーン！
最初はバタバタしていたよっちゃんですが、毎日練習するうちに、まるで魚のようにスイスイと泳げるようになりました。

![川遊びのイメージ](https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80)

***

# 剣術の楽しさに目覚める

体が鍛えられてくると、よっちゃんは剣術（けんじゅつ）の道場に通うことになりました。

「めん！ どう！ つき！」
道場には、元気な掛け声が響きます。

最初は竹刀が重くてフラフラしていたよっちゃんですが、お姉さんとの特訓のおかげで、だんだん素早い動きができるようになってきました。
「剣術って、もしかしてすごく面白いかも！」
よっちゃんの心に、小さな火が灯りました。

![剣道の面](https://images.unsplash.com/photo-1507120410856-1f35574c3b45?auto=format&fit=crop&w=800&q=80)

***

# 心も体も、たくましく

季節はめぐり、よっちゃんはどんどん成長していきました。

あんなに細くて弱々しかった体には、がっしりとした筋肉がつき、おねしょもしなくなりました。
何より、すぐにメソメソ泣いていた顔つきが、きりっと引き締まった、かっこいい男の子になっていたのです。

「よっちゃん、ずいぶん強くなったね」
近所の人たちも、目を見張るほどでした。

![夕日を浴びて立つ少年](https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=800&q=80)

***

# 弱いものを助ける勇気

ある日の夕方、道場からの帰り道を歩いていると、神社の裏からクーン、クーンと悲しい鳴き声が聞こえてきました。

そっとのぞいてみると、小さくて可愛い子犬が、いじめっ子たちに囲まれて、いじわるをされていました。

「おい、もっと石を投げてみようぜ！」
「やめてよ！ 子犬がかわいそうじゃないか！」
よっちゃんは、思わず叫んでいました。

![傷ついた子犬のイメージ](https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=800&q=80)

***

<div class="effect-flash"></div>

# 勇気を出して、立ち向かえ！

「なんだ、お前は！ <span class="effect-glitch">泣き虫のよっちゃんじゃないか！</span>」
いじめっ子たちが、よっちゃんを取り囲みます。

むかしのよっちゃんなら、ここで泣いて逃げ出していたでしょう。
でも、今のよっちゃんは違います。

「弱いものをいじめるなんて、武士（ぶし）のすることじゃないぞ。ボクが相手だ。かかってきなさい！」
よっちゃんは、木刀をしっかりと構えました。

![対峙するイメージ](https://images.unsplash.com/photo-1517130038641-a774d04afb3c?auto=format&fit=crop&w=800&q=80)

***

# 強い心がつかんだ勝利

「やぁ！」
いじめっ子の一人が飛びかかってきましたが、よっちゃんはするりと身をかわし、相手の手をパシッと叩きました。

「うわっ、強い！」
よっちゃんの素早い動きと、鋭い気迫に圧倒されたいじめっ子たちは、クモの子を散らすように逃げていきました。

「よし、もう大丈夫だよ」
よっちゃんは子犬を優しく抱きしめました。
弱いものを守る、<span class="effect-pulse">本当の強さ</span>を手に入れた瞬間でした。

![子供たちの笑顔](https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?auto=format&fit=crop&w=800&q=80)

***

# 土佐の広い海

ある日、よっちゃんは乙女姉さんと一緒に、桂浜（かつらはま）という海岸へ行きました。

目の前には、どこまでも、どこまでも続く、青くて大きな太平洋（たいへいよう）が広がっています。

「すごいなぁ……。お姉ちゃん、この海の向こうには、何があるの？」
「海の向こうにはね、私たちがまだ見たこともない、広くて新しい世界があるんだよ」

![太平洋の荒波](https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80)

***

# 世界を夢見る少年

「新しい世界……！」

よっちゃんの胸は、<span class="effect-heartbeat">ワクワクとした高鳴り</span>でいっぱいになりました。

日本という小さな国を飛び出して、あの大きな海を船で渡り、世界中の人と友達になる.
そんな大きな夢が、よっちゃんの心に生まれました。

「ボク、いつか絶対に、あの海の向こうに行くよ！」
よっちゃんは、力強く宣言しました。

![帆船のイメージ](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80)

***

# そして、伝説のヒーローへ

泣き虫で、おねしょばかりしていた「よっちゃん」は、お姉さんの愛と、自分の努力で、強くて優しい男の子へと成長しました。

この少年こそが、のちに日本中を駆け巡り、新しい時代を切り開くヒーロー、**坂本龍馬**になるのです。

「日本を、今一度せんたくいたし申候」

龍馬の冒険は、この土佐の海から始まったばかりです。
さあ、みんなも自分の夢に向かって、一歩を踏み出してみよう！

![日本の夜明けのイメージ](https://images.unsplash.com/photo-1494548162494-384bba4ab999?auto=format&fit=crop&w=800&q=80)`;

async function run() {
    // 1. Update Horror book
    const horrorId = 'df616fc3-c24a-45dd-b939-f02bae5a061f';
    const { data: d1, error: err1 } = await supabase
        .from('books')
        .update({ markdown_content: horrorMarkdown })
        .eq('id', horrorId)
        .select();
    if (err1) {
        console.error('Update horror failed:', err1);
    } else {
        console.log('Update horror success! Title:', d1[0].title);
    }

    // 2. Update Ryoma book
    const ryomaId = 'c29c5d62-c9fb-4042-ba5f-da0bc50cb38d';
    const { data: d2, error: err2 } = await supabase
        .from('books')
        .update({ markdown_content: ryomaMarkdown })
        .eq('id', ryomaId)
        .select();
    if (err2) {
        console.error('Update ryoma failed:', err2);
    } else {
        console.log('Update ryoma success! Title:', d2[0].title);
    }
}
run();
