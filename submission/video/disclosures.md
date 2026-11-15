# Подписи и раскрытие ИИ для ролика с Ламой

[Сценарий](../docs/demo-video.md) · [Производственный план](README.md)

## Постоянная подпись в кадре

```text
AI-edited image
```

Показывать рядом с Ламой всё время, пока виден сгенерированный персонаж: с 2-й секунды до конца ролика. Начальное живое видео не является сгенерированным изображением. Подпись входит в общие 29 секунд и не заменяется дополнительной заставкой.

## Описание ролика

Готовая строка о уже использованном ИИ:

```text
The Lama presenter image was generated with OpenAI ChatGPT from an original photograph of our plush alpaca. Live-action footage and application captures are real recordings. OpenAI Codex assisted with the script and production preparation. Independent project; not affiliated with or endorsed by NASA. Fire-detection data: NASA FIRMS.
```

Если финальный голос действительно будет создан в ElevenLabs, добавить:

```text
The English narration was synthesized using ElevenLabs.
```

При другом провайдере указать его фактическое название; при человеческой записи строку о синтетическом голосе не добавлять.

## Поле про ИИ в заявке

В [описании проекта](../docs/project-description.md#6-use-of-super-intelligence-si) отмечено использование генерации изображения Ламы. Сведения о голосе заполняются после его создания. Имя конкретной модели генерации изображения не указываем: встроенный инструмент его не сообщил.

## Метаданные MP4

В поле `comment` при экспорте записать:

```text
AI-edited character image: OpenAI ChatGPT. Script and production preparation assisted by OpenAI Codex. Live-action footage and app captures are real recordings.
```

Если использована синтетическая озвучка ElevenLabs, дополнить тем же полем:

```text
AI-generated English narration: ElevenLabs.
```

После экспорта прочитать реальные теги через `ffprobe -v error -show_entries format=duration:format_tags=comment -of json <video.mp4>`. Наличие этой инструкции не означает, что метаданные уже записаны: финального MP4 пока нет.

## Перед публикацией

Пользователь сообщил, что Алексей — участник команды, и выбрал вариант вступления с ним в кадре. Отдельное согласие в текущем процессе не запрашивается.

После первого монтажа выяснить принадлежность значков на платке. До ответа не считать их проверенными и не обещать публикационную готовность ролика.
