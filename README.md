# Supernote Obsidian Digest

The goal of this plugin is going to be to automatically offload my Supernote Digests into obsidian without having to manually export them or extrapolate them from a PDF export file.

There will be two main folder structures that you can choose in the settings.

1. Automic Notes
    - This will break down each digest into it's own note and tag the text
2. Document Notes
    - This will create a md file for each text and save all digests into that one MD file per text

## Initial Research and Rough Plan

The user will create a backup of their digests which creates a backup.snbak which is basically a zip file.

In this zip file there are files with the handwritten content and a json file with the highlighted text, a link to the appropriate hand written file, and other meta data.

We will use both of these and leverage the supernote-typescript plugin to offload these files into our obsidian vault.

User Uploads backup file -> Chooses File Structure -> Plugin unzips and processes files -> Creates only new notes, but does not replace notes that have been already added.

### Open Question

On the second backup upload, how will I make sure not to upload stale notes?

### Read Backup Function todos

- [x] create type for knowledge json file
- [x] create folder in Obsidian
- [x] create template for notes
- [x] create notes based on the knowledge file
- [x] make sure notes do not get recreated
- [x] add in the mark files into the notes

- [x] Create setting to allow users to choose which note structure they want
- [x] Figure out the Digest Folder Setting
- [x] Create an Image Folder Setting

- [x] Create structure for notes organized by document
    - [x] fix header of file
    - [x] Keep certain meta data like page number and created on on the note itself rather than the header

- [ ] Create better structure around Atomic Notes
    - [x] create an atlas within the supernote-digest folder
    - [x] create MOC template for each book
    - [ ] create right and left buttons in template

- [ ] see if there is a way to trim the empty space on the mark files
- [ ] Create docs and details within settings to inform users how to find backup file

- [x] Get github action working
