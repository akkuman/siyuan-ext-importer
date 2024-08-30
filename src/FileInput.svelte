<script>
    export let files = [];
    export let accept_ext = [];

    function handleFileChange(event) {
        files = Array.from(event.target.files);
    }
</script>

<div class="file-input">
    <label for="file-upload"> 选择你要导入的文件 </label>
    <input id="file-upload" type="file" accept={accept_ext.join(',')} on:change={handleFileChange} />
</div>

<div class="file-list">
    {#if files.length > 0}
        <ul>
            {#each files as file}
                <li>{file.name}</li>
            {/each}
        </ul>
    {:else}
        <p>未选择任何文件</p>
    {/if}
</div>

<style>
    .file-input {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed #aaa;
        padding: 20px;
        border-radius: 10px;
        cursor: pointer;
        transition: border-color 0.3s ease;
    }

    .file-input:hover {
        border-color: #888;
    }

    .file-input input[type="file"] {
        display: none;
    }

    .file-list {
        margin-top: 15px;
        text-align: center;
    }

    .file-list ul {
        list-style: none;
        padding: 0;
    }

    .file-list li {
        margin: 5px 0;
        font-size: 14px;
        color: #333;
    }

    .file-list p {
        font-size: 14px;
        color: #666;
    }
</style>
